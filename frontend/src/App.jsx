import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const StatusCard = ({ label, value, healthy }) => (
  <article className="status-card">
    <span className={`status-dot ${healthy ? 'online' : 'offline'}`} aria-hidden="true" />
    <div>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  </article>
);

export default function App() {
  const [apiStatus, setApiStatus] = useState('Đang kiểm tra…');
  const [socketStatus, setSocketStatus] = useState('Đang kết nối…');

  useEffect(() => {
    let active = true;

    fetch('/api/health')
      .then(async (response) => {
        if (!response.ok) throw new Error('API chưa sẵn sàng');
        const data = await response.json();
        if (active) setApiStatus(data.database === 'connected' ? 'API + MySQL hoạt động' : 'API hoạt động');
      })
      .catch(() => active && setApiStatus('Chưa kết nối được API'));

    const socket = io({ path: '/socket.io' });
    socket.on('connect', () => setSocketStatus('Socket.IO đã kết nối'));
    socket.on('disconnect', () => setSocketStatus('Socket.IO đã ngắt'));
    socket.on('connect_error', () => setSocketStatus('Chưa kết nối được Socket.IO'));

    return () => {
      active = false;
      socket.disconnect();
    };
  }, []);

  const apiHealthy = apiStatus.includes('hoạt động');
  const socketHealthy = socketStatus.includes('đã kết nối');

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">Development environment</p>
        <h1>Martin Learning Systems</h1>
        <p className="intro">
          React, Express, Socket.IO và MySQL đã sẵn sàng để phát triển cùng nhau.
        </p>
        <div className="status-grid">
          <StatusCard label="Backend" value={apiStatus} healthy={apiHealthy} />
          <StatusCard label="Realtime" value={socketStatus} healthy={socketHealthy} />
        </div>
      </section>
    </main>
  );
}
