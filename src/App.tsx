import React, {useEffect, useRef, useState} from 'react';
import {
  Button,
  Divider,
  Fieldset,
  Panel,
  Slider,
  TextField,
  Toolbar,
  Window,
  WindowContent,
  WindowHeader,
} from 'react95';

import RNet from './rnet-pi/rnet';
import Zone from './rnet-pi/zone';
import ExtraZoneParam from './rnet-pi/extraZoneParam';

const ROOT_CONTROLLER = 0;
const MAX_ZONES = 6;

function App() {
  const [url, setURL] = useState(localStorage.getItem('lastUrl') || 'ws://localhost:8080');
  const [rnetState, setRNetState] = useState('Ready');
  const [, setUpdate] = useState(0);
  const rnetRef = useRef<RNet | null>(null);
  const [optimisticVolume, setOptimisticVolume] = useState<Map<number, number>>(new Map());
  const [loadedZones, setLoadedZones] = useState<Set<number>>(new Set());
  const [zoneParam, setZoneParam] = useState<{[zoneId: number]: number}>({});

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
            {rnetRef.current?._zones?.[ROOT_CONTROLLER]?.map((zone, i) => {
              const zoneId = zone.getZoneID();
              const param = zoneParam[zoneId] ?? 4; // Default to volume (TURN_ON_VOLUME)
              let min = 0,
                max = 100,
                step = 1,
                value = 0;
              if (param === ExtraZoneParam.BASS || param === ExtraZoneParam.TREBLE) {
                min = -10;
                max = 10;
                step = 1;
                const paramValue = zone.getParameter(param);
                value = typeof paramValue === 'number' ? paramValue : 0;
              } else if (param === ExtraZoneParam.TURN_ON_VOLUME) {
                min = 0;
                max = 100;
                step = 10;
                const vol = optimisticVolume.get(zoneId);
                value = typeof vol === 'number' ? vol : zone.getVolume();
              }
              return (
                <Fieldset
                  key={i}
                  label={<span onClick={() => changeZoneName(zone)}>{zone.getName()}</span>}
                  disabled={!loadedZones.has(zoneId)}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 4,
                      verticalAlign: 'middle',
                      width: '100%',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Button
                      active={zone.getPower()}
                      onClick={() => zone.setPower(!zone.getPower())}
                      style={{verticalAlign: 'middle'}}
                    >
                      Power
                    </Button>
                    <Button
                      square
                      active={param === ExtraZoneParam.TURN_ON_VOLUME}
                      onClick={() =>
                        setZoneParam(zp => ({...zp, [zoneId]: ExtraZoneParam.TURN_ON_VOLUME}))
                      }
                      aria-label="Volume"
                    >
                      <span role="img" aria-label="volume">
                        🔈
                      </span>
                    </Button>
                    <Button
                      square
                      active={param === ExtraZoneParam.BASS}
                      onClick={() => setZoneParam(zp => ({...zp, [zoneId]: ExtraZoneParam.BASS}))}
                      aria-label="Bass"
                    >
                      <span role="img" aria-label="bass">
                        𝄢
                      </span>
                    </Button>
                    <Button
                      square
                      active={param === ExtraZoneParam.TREBLE}
                      onClick={() => setZoneParam(zp => ({...zp, [zoneId]: ExtraZoneParam.TREBLE}))}
                      aria-label="Treble"
                    >
                      <span role="img" aria-label="treble">
                        𝄞
                      </span>
                    </Button>
                  </div>
                  <Slider
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    style={{marginBottom: 0, marginTop: 8}}
                    onChange={
                      ((
                        _e:
                          | React.KeyboardEvent
                          | React.TouchEvent
                          | React.FormEvent<HTMLDivElement>,
                        v: number
                      ) => {
                        if (param === ExtraZoneParam.TURN_ON_VOLUME) {
                          setOptimisticVolume(
                            new Map([...Array.from(optimisticVolume.entries()), [zoneId, v]])
                          );
                          zone.setVolume(v);
                        } else {
                          zone.setParameter(param, v);
                          setUpdate(x => x + 1); // force UI update
                        }
                      }) as React.FormEventHandler<HTMLDivElement> &
                        ((event: React.KeyboardEvent | React.TouchEvent, newValue: number) => void)
                    }
                  />
                </Fieldset>
              );
            })}
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
