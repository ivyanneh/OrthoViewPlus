import { useEffect, useRef, useState } from 'react';
import api from '../api/client.js';

export default function MeshViewer({ url, label }) {
  const canvasRef = useRef(null);
  const drag = useRef(null);
  const [mesh, setMesh] = useState(null);
  const [error, setError] = useState('');
  const [rotation, setRotation] = useState({ x: -0.3, y: 0.5 });

  useEffect(() => {
    let active = true;
    api.get(url, { responseType: 'json' }).then(({ data }) => {
      if (active) setMesh(data);
    }).catch(() => {
      if (active) setError('Unable to load the generated mesh.');
    });
    return () => { active = false; };
  }, [url]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mesh?.vertices?.length || !mesh?.faces?.length) return;
    const context = canvas.getContext('2d');
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.scale(ratio, ratio);
    context.fillStyle = '#07111d';
    context.fillRect(0, 0, width, height);

    const cosX = Math.cos(rotation.x);
    const sinX = Math.sin(rotation.x);
    const cosY = Math.cos(rotation.y);
    const sinY = Math.sin(rotation.y);
    const projected = mesh.vertices.map(([x, y, z]) => {
      const rx = x * cosY - z * sinY;
      const rz = x * sinY + z * cosY;
      const ry = y * cosX - rz * sinX;
      const depth = y * sinX + rz * cosX;
      return { x: width / 2 + rx * width * 0.42, y: height / 2 + ry * height * 0.42, depth };
    });
    const faces = mesh.faces.map((face) => ({
      points: face.map((index) => projected[index]).filter(Boolean),
      depth: face.reduce((sum, index) => sum + (projected[index]?.depth || 0), 0) / face.length,
    })).filter((face) => face.points.length === 3).sort((a, b) => a.depth - b.depth);
    context.lineWidth = 0.35;
    for (const face of faces) {
      context.beginPath();
      context.moveTo(face.points[0].x, face.points[0].y);
      context.lineTo(face.points[1].x, face.points[1].y);
      context.lineTo(face.points[2].x, face.points[2].y);
      context.closePath();
      const shade = Math.max(70, Math.min(190, 130 + face.depth * 35));
      context.fillStyle = `rgb(${Math.round(shade * 0.45)}, ${shade}, ${Math.round(shade * 0.95)})`;
      context.fill();
      context.strokeStyle = 'rgba(125, 210, 235, 0.16)';
      context.stroke();
    }
  }, [mesh, rotation]);

  function onPointerDown(event) {
    drag.current = { x: event.clientX, y: event.clientY, rotation };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!drag.current) return;
    setRotation({
      x: drag.current.rotation.x + (event.clientY - drag.current.y) * 0.01,
      y: drag.current.rotation.y + (event.clientX - drag.current.x) * 0.01,
    });
  }

  if (error) return <p role="alert">{error}</p>;
  if (!mesh) return <p>Loading 3D result...</p>;
  if (!mesh.vertices?.length || !mesh.faces?.length) return <p>This result does not contain a renderable mesh.</p>;

  return (
    <figure className="ai-mesh-figure">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        aria-label={`${label}. Drag to rotate the 3D visualization.`}
      />
      <figcaption>{label} · Drag to rotate</figcaption>
    </figure>
  );
}
