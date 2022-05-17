import React, {useEffect, useRef, useState} from 'react';
import {
  Button,
  Divider,
  Fieldset,
  Panel,
  Select,
  Slider,
  TextField,
  Toolbar,
  Window,
  WindowContent,
  WindowHeader,
} from 'react95';

import RNet from './rnet-pi/rnet';
import Zone from './rnet-pi/zone';

const ROOT_CONTROLLER = 0;
const MAX_ZONES = 6;

function App() {
  const [url, setURL] = useState(localStorage.getItem('lastUrl') || 'ws://localhost:8080');
  const [rnetState, setRNetState] = useState('Ready');
  const [_, setUpdate] = useState(0);
  const rnetRef = useRef<RNet | null>(null);
  const [optimisticVolume, setOptimisticVolume] = useState<Map<number, number>>(new Map());
  const [loadedZones, setLoadedZones] = useState<Set<number>>(new Set());

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setURL(e.target.value);
    localStorage.setItem('lastUrl', e.target.value);
  }

  function onConnect() {
    const rnet = new RNet(url);
    setRNetState('Connecting...');
    rnet.on('update', (zoneId?: number) => {
      if (zoneId != null) {
        setLoadedZones(loadedZones => {
          if (
            loadedZones.size + 1 === rnetRef.current?.getZonesSize(ROOT_CONTROLLER) &&
            !loadedZones.has(zoneId)
          ) {
            setRNetState('Connected');
          }
          return new Set([...Array.from(loadedZones), zoneId]);
        });
      } else {
        // Force a refresh
        setUpdate(x => x + 1);
      }
    });
    rnet.on('error', err => {
      console.error('Websocket error:', err);
      setRNetState('Error');
    });
    rnet.on('connected', () => {
      setRNetState(rnet.getZonesSize(ROOT_CONTROLLER) ? 'Waiting for zone info..' : 'Connected');
      rnetRef.current = rnet;
    });
    rnet.on('disconnected', () => {
      if (rnetState !== 'Error') {
        setRNetState('Disconnected');
      }
      rnetRef.current = null;
    });
  }

  function addZone() {
    const zoneName = window.prompt('Name for the zone?');
    if (zoneName && rnetRef.current != null) {
      rnetRef.current.createZone(
        ROOT_CONTROLLER,
        rnetRef.current.getZonesSize(ROOT_CONTROLLER),
        zoneName,
        true
      );
      setUpdate(x => x + 1);
    }
  }

  function changeZoneName(zone: Zone) {
    const zoneName = window.prompt('New name for the zone?', zone.getName());
    if (zoneName) {
      zone.setName(zoneName);
      setUpdate(x => x + 1);
    }
  }

  useEffect(() => {
    return () => rnetRef.current?.disconnect();
  }, []);

  const sources =
    rnetRef.current?.getSources()?.map((_, i) => ({value: i, label: String(i)})) ?? [];

  return (
    <div id="root">
      <Window style={{width: '100%', maxWidth: '500px'}}>
        <WindowHeader
          style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}
        >
          <span>RNet</span>
        </WindowHeader>
        <Toolbar>
          <Button
            variant="menu"
            size="sm"
            onClick={addZone}
            disabled={
              !rnetRef.current || rnetRef.current.getZonesSize(ROOT_CONTROLLER) >= MAX_ZONES
            }
          >
            New Zone
          </Button>
        </Toolbar>
        <Divider />
        <WindowContent>
          <div style={{display: 'flex'}}>
            <TextField value={url} onChange={onChange} fullWidth />
            <Button onClick={onConnect} style={{marginLeft: 4}}>
              Connect
            </Button>
          </div>
          <div
            style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gridGap: 16, marginTop: 16}}
          >
            {rnetRef.current?._zones?.[ROOT_CONTROLLER]?.map((zone, i) => (
              <Fieldset
                key={i}
                label={<span onClick={() => changeZoneName(zone)}>{zone.getName()}</span>}
                disabled={!loadedZones.has(zone.getZoneID())}
              >
                <Button
                  active={zone.getPower()}
                  onClick={() => zone.setPower(!zone.getPower())}
                  style={{verticalAlign: 'middle'}}
                >
                  Power
                </Button>
                <Select
                  value={zone.getSourceID()}
                  options={sources}
                  // @ts-ignore
                  onChange={(_, option) => zone.setSourceID(option.value)}
                  style={{verticalAlign: 'middle', marginLeft: 8}}
                />
                <Slider
                  // size="100%"
                  min={0}
                  max={100}
                  step={10}
                  value={optimisticVolume.get(zone.getZoneID()) ?? zone.getVolume()}
                  style={{marginBottom: 0, marginTop: 8}}
                  // @ts-ignore
                  onChange={(_, value) => {
                    setOptimisticVolume(
                      new Map([
                        ...Array.from(optimisticVolume.entries()),
                        [zone.getZoneID(), value],
                      ])
                    );
                    zone.setVolume(value);
                  }}
                />
              </Fieldset>
            ))}
          </div>
        </WindowContent>
        <Panel variant="well" style={{display: 'block', margin: '0.25rem', paddingLeft: '0.25rem'}}>
          State: {rnetState}
        </Panel>
      </Window>
    </div>
  );
}

export default App;
