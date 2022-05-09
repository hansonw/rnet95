import React, {useEffect, useRef, useState} from 'react';
import {Button, TextField, Window, WindowContent, WindowHeader} from 'react95';

import RNet from './rnet-pi/rnet';

function App() {
  const [url, setURL] = useState(localStorage.getItem('lastUrl') || 'localhost:8080');
  const [rnetState, setRNetState] = useState('Ready');
  const rnetRef = useRef<RNet | null>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setURL(e.target.value);
    localStorage.setItem('lastUrl', e.target.value);
  }

  function onConnect() {
    const rnet = new RNet(url);
    setRNetState('Connecting...');
    rnet.on('error', err => {
      console.error('Websocket error:', err);
    });
    rnet.on('connected', () => {
      setRNetState('Connected');
    });
    rnet.on('disconnected', () => {
      setRNetState('Disconnected');
    });
    rnetRef.current = rnet;
  }

  useEffect(() => {
    return () => rnetRef.current?.disconnect();
  }, []);

  return (
    <Window className="window">
      <WindowHeader
        style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}
      >
        <span>RNet</span>
      </WindowHeader>
      <WindowContent>
        <div style={{display: 'flex'}}>
          <TextField value={url} onChange={onChange} fullWidth />
          <Button onClick={onConnect} style={{marginLeft: 4}}>
            Connect
          </Button>
        </div>
        {rnetState}
      </WindowContent>
    </Window>
  );
}

export default App;
