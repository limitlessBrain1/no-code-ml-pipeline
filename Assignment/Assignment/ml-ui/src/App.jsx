// ml-ui/src/App.jsx
import React, { useRef, useState, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  Handle,
  useNodesState,
  useEdgesState,
} from "reactflow";
import "reactflow/dist/style.css";
import "./normal.css";
import { FiUpload, FiSettings, FiDivide, FiCpu, FiBarChart } from "react-icons/fi";

const API_BASE = "http://127.0.0.1:8000";

/* CSV parser (fallback) */
function csvToArray(str, delimiter = ",") {
  const lines = str.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(delimiter).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(delimiter).map((c) => c.trim());
    const obj = {};
    headers.forEach((h, i) => (obj[h] = cols[i] ?? ""));
    return obj;
  });
  return { headers, rows };
}

/* Upload Node used in ReactFlow (not required to be clickable) */
const UploadNode = ({ data }) => {
  // node-level file input (works on some browsers)
  const handleNodeUpload = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = csvToArray(ev.target.result);
      data.onUpload && data.onUpload(parsed);
    };
    reader.readAsText(f);
  };

  return (
    <div className="node-box" style={{ pointerEvents: "auto" }}>
      <Handle type="target" position="top" />
      <div className="node-title"><FiUpload /> Upload Dataset</div>
      <input type="file" accept=".csv,.xlsx,.xls" onChange={handleNodeUpload} />
      <div style={{fontSize:12, color:"#666", marginTop:8}}>Tip: you can also upload from the left sidebar</div>
      <Handle type="source" position="bottom" />
    </div>
  );
};

const SimpleNode = ({ data }) => (
  <div className="node-box" style={{ opacity: 1 }} >
    <Handle type="target" position="top" />
    <div className="node-title">{data.icon} {data.label}</div>
    <div className="node-sub">{data.children}</div>
    <Handle type="source" position="bottom" />
  </div>
);

const initialNodes = [
  { id: "1", type: "uploadNode", position: { x: 50, y: 30 }, data: {} },
  { id: "2", type: "simpleNode", position: { x: 320, y: 30 }, data: { label: "Preprocess", icon: <FiSettings />, children: "Standardize / Normalize" } },
  { id: "3", type: "simpleNode", position: { x: 620, y: 30 }, data: { label: "Split", icon: <FiDivide />, children: "Train/Test" } },
  { id: "4", type: "simpleNode", position: { x: 920, y: 200 }, data: { label: "Model", icon: <FiCpu />, children: "Select and Train" } },
  { id: "5", type: "simpleNode", position: { x: 920, y: 30 }, data: { label: "Results", icon: <FiBarChart />, children: "Accuracy / Charts" } },
];

const initialEdges = [
  { id: "e1-2", source: "1", target: "2", animated: true },
  { id: "e2-3", source: "2", target: "3" },
  { id: "e3-4", source: "3", target: "4" },
  { id: "e4-5", source: "4", target: "5" },
];
/*
 // ✅ Declare OUTSIDE App()
const ColumnSelect = ({ allColumns, targetCol, setTargetCol }) => {
  return (
    <select
      value={targetCol}
      onChange={(e) => setTargetCol(e.target.value)}
    >
      <option value="">-- select target column --</option>
      {allColumns.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
};
*/
/*
const ColumnSelect = () => {
  if (!allColumns.length) {
    return <select disabled><option>No columns</option></select>;
  }

  return (
    <select value={targetCol} onChange={(e) => setTargetCol(e.target.value)}>
      <option value="">-- select target column --</option>
      {allColumns.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
};
*/
// ✅ Declare OUTSIDE App()
const ColumnSelect = ({ allColumns, targetCol, setTargetCol }) => {
  if (!allColumns || allColumns.length === 0) {
    return (
      <select disabled>
        <option>No columns</option>
      </select>
    );
  }

  return (
    <select
      value={targetCol}
      onChange={(e) => setTargetCol(e.target.value)}
    >
      <option value="">-- select target column --</option>
      {allColumns.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
};




export default function App() {
  const fileInputRef = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [nodeTypes] = useState({ uploadNode: UploadNode, simpleNode: SimpleNode });

  const [datasetPreview, setDatasetPreview] = useState(null);
  const [allColumns, setAllColumns] = useState([]);
  const [targetCol, setTargetCol] = useState("");
  const [status, setStatus] = useState("Ready");

  // preprocessing options
  const [standardize, setStandardize] = useState(false);
  const [normalize, setNormalize] = useState(false);

  // split
  const [testRatio, setTestRatio] = useState(0.3);

  // model selection
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("logistic");

  // training results
  const [accuracy, setAccuracy] = useState(null);
  const [confusionB64, setConfusionB64] = useState(null);

  useEffect(() => {
    // inject node callbacks for node-level upload
    setNodes((nds) =>
      nds.map((n) =>
        n.id === "1"
          ? {
              ...n,
              data: {
                onUpload: (parsed) => {
                  // if user uploads via node, we set preview but do not send to backend yet
                  const headers = parsed.headers;
                  setAllColumns(headers);
                  setDatasetPreview({ headers, rows: parsed.rows });
                  setStatus(`Preview loaded (local) ${parsed.rows.length} rows`);
                },
              },
            }
          : n
      )
    );
  }, [setNodes]);

  // helper: call backend upload endpoint
  async function uploadToBackend(file) {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setStatus("Uploading...");
    try {
      const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || "Upload failed");
        return;
      }
      setDatasetPreview(data.preview);
      setAllColumns(data.preview.headers);
      setStatus("Uploaded to backend");
    } catch (err) {
      console.error(err);
      setStatus("Upload error");
    }
  }

  // hidden sidebar input change
  const handleSidebarFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    // call backend
    await uploadToBackend(f);
  };

  // Preprocess call
  /*
  const callPreprocess = async () => {
    if (!targetCol) { setStatus("Please select target column first"); return; }
    setStatus("Preprocessing...");
    try {
      const fd = new FormData();
      fd.append("standardize", standardize ? "true" : "false");
      fd.append("normalize", normalize ? "true" : "false");
      fd.append("target_col", targetCol);
      const res = await fetch(`${API_BASE}/preprocess`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || "Preprocess failed");
        return;
      }
      setStatus("Preprocessing done");
    } catch (err) {
      console.error(err);
      setStatus("Preprocess error");
    }
  };
  */
 const callPreprocess = async () => {
  if (!targetCol) {
    setStatus("Please select target column first");
    return;
  }

  const method = standardize ? "standard" : normalize ? "normalize" : "";

  if (!method) {
    setStatus("Select a preprocessing method");
    return;
  }

  setStatus("Preprocessing...");

  try {
    const fd = new FormData();
    fd.append("method", method);
    fd.append("target_col", targetCol);

    const res = await fetch(`${API_BASE}/preprocess`, {
      method: "POST",
      body: fd,
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      setStatus(data.error || "Preprocess failed");
      return;
    }

    setStatus("Preprocessing done");
  } catch (err) {
    console.error(err);
    setStatus("Preprocess error");
  }
};


  // Split call
  /*
  const callSplit = async () => {
    if (!targetCol) { setStatus("Please select target column first"); return; }
    setStatus("Splitting dataset...");
    try {
      const fd = new FormData();
      fd.append("test_size", testRatio);
      fd.append("random_state", 42);
      fd.append("target_col", targetCol);
      const res = await fetch(`${API_BASE}/split`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || "Split failed");
        return;
      }
      setStatus(`Split done — train ${data.train_shape}, test ${data.test_shape}`);
    } catch (err) {
      console.error(err);
      setStatus("Split error");
    }
  };
  */
 const callSplit = async () => {
  if (!targetCol) {
    setStatus("Please select target column first");
    return;
  }

  setStatus("Splitting dataset...");

  try {
    const fd = new FormData();
    fd.append("test_size", testRatio);
    fd.append("target_col", targetCol);

    const res = await fetch(`${API_BASE}/split`, {
      method: "POST",
      body: fd,
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      setStatus(data.error || "Split failed");
      return;
    }

    setStatus(`Split done — Train ${data.train_shape}, Test ${data.test_shape}`);
  } catch (err) {
    console.error(err);
    setStatus("Split error");
  }
};


  // Train call
  const callTrain = async () => {
    if (!targetCol) { setStatus("Please select target column first"); return; }
    setStatus("Training model...");
    try {
      const fd = new FormData();
      fd.append("model_name", selectedModel);
      fd.append("target_col", targetCol);
      const res = await fetch(`${API_BASE}/train`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || "Training failed");
        return;
      }
      setAccuracy(data.accuracy);
      setConfusionB64(data.confusion_matrix_base64);
      setStatus("Training complete");
    } catch (err) {
      console.error(err);
      setStatus("Train error");
    }
  };

/*
  // helper: fill select with columns
  const ColumnSelect = () => (
    <select value={targetCol} onChange={(e) => setTargetCol(e.target.value)}>
      <option value="">-- select target column --</option>
      {allColumns.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
  */
  

  return (
    <div className="layout">
      <header className="topbar">
        <div className="logo">No-Code ML Studio</div>
        <div className="top-status">{status}</div>
      </header>

      <div className="main">
        {/* LEFT sidebar */}
        <aside className="sidebar">
          <h2>Pipeline</h2>

          <button className="sidebar-btn" onClick={() => fileInputRef.current && fileInputRef.current.click()}>
            <FiUpload /> Upload
          </button>

          <button className="sidebar-btn" onClick={() => setStatus("Configure preprocessing on right panel")}>
            <FiSettings /> Preprocess
          </button>

          <button className="sidebar-btn" onClick={() => { setTestRatio(r => r); setStatus("Split controls below"); }}>
            <FiDivide /> Split
          </button>

          <button className="sidebar-btn" onClick={() => setModelPanelOpen(true)}>
            <FiCpu /> Model
          </button>

          <button className="sidebar-btn" onClick={() => { setStatus('See results on right'); }}>
            <FiBarChart /> Results
          </button>

          <div style={{ marginTop: 18, fontSize: 13, color:"#555" }}>
            <div><strong>Dataset Preview</strong></div>
            <div style={{marginTop:8}}>
              <small>Upload CSV to preview</small>
            </div>
          </div>
        </aside>

        {/* Hidden top-level input */}
        <input type="file" ref={fileInputRef} style={{display:"none"}} accept=".csv,.xlsx,.xls" onChange={handleSidebarFile} />

        {/* CENTER Canvas */}
        <section className="canvas-area">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={(params)=> setEdges((eds)=> addEdge(params, eds))}
            fitView
          >
            <MiniMap />
            <Controls />
            <Background gap={12} />
          </ReactFlow>
        </section>

        {/* RIGHT inspector */}
        <aside className="inspector">
          <h3>Dataset Preview</h3>

          {/* Column selector */}
          <div style={{ marginTop: 8 }}>
            <label style={{fontSize:13}}>Target column:</label><br/>
           <ColumnSelect
             allColumns={allColumns}
                targetCol={targetCol}
                   setTargetCol={setTargetCol}
                   />
                   </div>


             
          
          
          

          {/* Preprocess controls */}
            <div style={{ marginTop: 12 }}>
            <label>
             <input
              type="radio"
               name="preprocess"
               checked={standardize}
                onChange={() => {
                 setStandardize(true);
                  setNormalize(false);
                       }}
                    />
                   Standardize (Z-score)
                       </label>

                   <br />

                 <label>
                <input
               type="radio"
      name="preprocess"
      checked={normalize}
      onChange={() => {
        setNormalize(true);
        setStandardize(false);
      }}
       />
         Normalize (MinMax)
     </label>

       <div style={{ marginTop:8 }}>
    <button onClick={callPreprocess}>Apply Preprocessing</button>
  </div>
</div>
          



          {/* Split controls */}
          <div style={{ marginTop: 16 }}>
            <label>Test ratio: {Math.round(testRatio*100)}%</label><br/>
            <input type="range" min="0.1" max="0.5" step="0.05" value={testRatio} onChange={(e)=>setTestRatio(parseFloat(e.target.value))} />
            <div style={{ marginTop:8 }}>
              <button onClick={callSplit}>Split Dataset</button>
            </div>
          </div>

          {/* Model selection & train */}
          <div style={{ marginTop:16 }}>
            <label>Selected model: </label>
            <select value={selectedModel} onChange={(e)=>setSelectedModel(e.target.value)}>
              <option value="logistic">Logistic Regression</option>
              <option value="tree">Decision Tree</option>
            </select>
            <div style={{ marginTop:8 }}>
              <button onClick={callTrain}>Train Model</button>
            </div>
          </div>

          {/* Results */}
          <div style={{ marginTop: 16 }}>
            <h4>Model Output</h4>
            {accuracy !== null && <div><strong>Accuracy:</strong> {(accuracy*100).toFixed(2)}%</div>}
            {confusionB64 && (
              <div style={{ marginTop: 8 }}>
                <img src={`data:image/png;base64,${confusionB64}`} alt="confusion" style={{maxWidth: "100%"}} />
              </div>
            )}
          </div>

          {/* dataset preview table */}
          <div style={{ marginTop: 18 }}>
            {datasetPreview ? (
              <>
                <div style={{fontWeight:600}}>Preview ({datasetPreview.shape ? datasetPreview.shape.join("x") : ""})</div>
                <div style={{ maxHeight: 240, overflow: "auto", marginTop:8 }}>
                  <table className="preview-table">
                    <thead>
                      <tr>{datasetPreview?.headers?.map((h)=> (<th key={h}>{h}</th>))}</tr>
                    </thead>
                    <tbody>
                     {datasetPreview?.rows?.slice(0, 10).map((row, i) => (
                       <tr key={i}>
                     {datasetPreview?.headers?.map((h) => (
                       <td key={h}>{row[h]}</td>
                      ))}
                    </tr>
                  ))}
                     </tbody>
                  </table>
                </div>
              </>
            ) : <div style={{color:"#666"}}>No dataset preview</div>}
          </div>
        </aside>
      </div>

      {/* Model drawer (optional) */}
      {modelPanelOpen && (
        <div className="drawer-overlay" onClick={() => setModelPanelOpen(false)}>
          <div className="drawer" onClick={(e)=>e.stopPropagation()}>
            <h3>Select Model</h3>
            <label style={{display:"block", marginTop:12}}>
              <input type="radio" name="model" value="logistic" checked={selectedModel==="logistic"} onChange={()=>setSelectedModel("logistic")} /> Logistic Regression
            </label>
            <label style={{display:"block", marginTop:8}}>
              <input type="radio" name="model" value="tree" checked={selectedModel==="tree"} onChange={()=>setSelectedModel("tree")} /> Decision Tree
            </label>
            <div style={{ marginTop: 14 }}>
              <button onClick={() => { setModelPanelOpen(false); setStatus(`Model selected: ${selectedModel}`); }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}