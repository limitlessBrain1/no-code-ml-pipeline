from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import accuracy_score
import base64
import matplotlib.pyplot as plt

app = FastAPI(title="No-Code ML Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/")
def root():
    return {"status": "Backend is running"}

# GLOBAL STATE
DATAFRAME = None
X_train = X_test = y_train = y_test = None

# ===================== UPLOAD =====================
@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    global DATAFRAME

    try:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        return {"error": f"CSV read failed: {str(e)}"}

    DATAFRAME = df

    preview = {
        "headers": list(df.columns),
        "rows": df.head(10).to_dict(orient="records"),
        "shape": df.shape
    }

    return {"preview": preview}


# ===================== PREPROCESS =====================
@app.post("/preprocess")
async def preprocess(
    standardize: bool = Form(False),
    normalize: bool = Form(False),
    target_col: str = Form(...)
):
    global DATAFRAME

    if DATAFRAME is None:
        return {"error": "Upload dataset first"}

    df = DATAFRAME.copy()

    if target_col not in df.columns:
        return {"error": "Invalid target column"}

    X = df.drop(columns=[target_col])

    if standardize:
        X = StandardScaler().fit_transform(X)

    if normalize:
        X = MinMaxScaler().fit_transform(X)

    df.loc[:, df.columns != target_col] = X
    DATAFRAME = df

    return {"message": "Preprocessing done"}


# ===================== SPLIT =====================
@app.post("/split")
async def split(
    test_size: float = Form(...),
    target_col: str = Form(...)
):
    global DATAFRAME, X_train, X_test, y_train, y_test

    if DATAFRAME is None:
        return {"error": "Upload dataset first"}

    X = DATAFRAME.drop(columns=[target_col])
    y = DATAFRAME[target_col]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42
    )

    return {
        "train_shape": X_train.shape,
        "test_shape": X_test.shape
    }


# ===================== TRAIN =====================
@app.post("/train")
async def train(
    model_name: str = Form(...),
    target_col: str = Form(...)
):
    global X_train, X_test, y_train, y_test

    if X_train is None:
        return {"error": "Split dataset first"}

    if model_name == "logistic":
        model = LogisticRegression(max_iter=200)
    else:
        model = DecisionTreeClassifier()

    model.fit(X_train, y_train)
    preds = model.predict(X_test)
    acc = accuracy_score(y_test, preds)

    # Confusion matrix plot
    plt.figure()
    plt.hist(preds)
    buf = io.BytesIO()
    plt.savefig(buf, format="png")
    plt.close()
    buf.seek(0)

    img_base64 = base64.b64encode(buf.read()).decode("utf-8")

    return {
        "accuracy": acc,
        "confusion_matrix_base64": img_base64
    }
