import { useState, useRef, useCallback, useEffect } from 'react';

const SVC   = '0000ff10-0000-1000-8000-00805f9b34fb';
const CBTNS = '0000ff11-0000-1000-8000-00805f9b34fb';
const CLEDS = '0000ff12-0000-1000-8000-00805f9b34fb';

export const LED_BITS = { shock:0, on_off:1, info:2, hands_off:3, low_belly:4, breast:5, buzzer:6 };
export const BTN_BITS = { shock:0, on_off:1, info:2, card_slot:3, pads_inserted:4 };

export function useBLE({ onButtonChange } = {}) {
  const [status, setStatus]     = useState('disconnected'); // disconnected | scanning | connected
  const [deviceName, setDeviceName] = useState(null);
  const [ledMask, setLedMaskState] = useState(0);
  const [btnMask, setBtnMask]   = useState(0);
  const [log, setLog]           = useState([]);
  const [knownDevices, setKnownDevices] = useState([]);
  const [available, setAvailable] = useState(null); // null = unknown/unsupported

  const deviceRef  = useRef(null);
  const charBtns   = useRef(null);
  const charLeds   = useRef(null);
  const ledMaskRef = useRef(0);
  const pollTimer  = useRef(null);
  const onBtnRef   = useRef(onButtonChange);
  useEffect(() => { onBtnRef.current = onButtonChange; }, [onButtonChange]);

  const addLog = useCallback((msg, type = '') => {
    const t = new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    setLog(l => [{ t, msg, type, id: Date.now() + Math.random() }, ...l].slice(0, 200));
  }, []);

  const onNotify = useCallback((e) => {
    const val = e.target.value.getUint8(0);
    setBtnMask(val);
    onBtnRef.current?.(val);
  }, []);

  const startPoll = useCallback(() => {
    if (pollTimer.current) return;
    pollTimer.current = setInterval(async () => {
      if (!charBtns.current || !deviceRef.current?.gatt.connected) return;
      try {
        const d = await charBtns.current.getDescriptor(0x2902);
        await d.readValue();
      } catch(_) {}
    }, 500);
  }, []);

  const stopPoll = useCallback(() => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
  }, []);

  const onDisconnect = useCallback(() => {
    stopPoll();
    setStatus('disconnected');
    setDeviceName(null);
    setBtnMask(0);
    charBtns.current = null;
    charLeds.current = null;
    deviceRef.current = null;
    addLog('Disconnected', 'err');
  }, [stopPoll, addLog]);

  // Shared GATT setup for both a fresh requestDevice() and a getDevices() reconnect.
  const attachDevice = useCallback(async (dev) => {
    const server  = await dev.gatt.connect();
    const service = await server.getPrimaryService(SVC);
    charBtns.current = await service.getCharacteristic(CBTNS);
    charLeds.current = await service.getCharacteristic(CLEDS);

    charBtns.current.addEventListener('characteristicvaluechanged', onNotify);
    await charBtns.current.startNotifications();

    const initBtn = await charBtns.current.readValue();
    const initLed = await charLeds.current.readValue();
    const bm = initBtn.getUint8(0);
    const lm = initLed.getUint8(0);
    setBtnMask(bm);
    ledMaskRef.current = lm;
    setLedMaskState(lm);

    startPoll();
    setStatus('connected');
    setDeviceName(dev.name || 'AED');
    addLog(`Connected — ${dev.name || 'AED'}`, 'ok');
  }, [onNotify, startPoll, addLog]);

  const connect = useCallback(async () => {
    if (!navigator.bluetooth) { addLog('Web Bluetooth not available', 'err'); return; }
    setStatus('scanning');
    addLog('Scanning...');
    try {
      const dev = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SVC] }],
        optionalServices: [SVC],
      });
      deviceRef.current = dev;
      dev.addEventListener('gattserverdisconnected', onDisconnect);
      await attachDevice(dev);
    } catch(e) {
      setStatus('disconnected');
      deviceRef.current = null;
      addLog(e.message || 'Connection failed', 'err');
    }
  }, [onDisconnect, attachDevice, addLog]);

  // Reconnect a device previously granted to this site (Bluetooth.getDevices()).
  const reconnect = useCallback(async (dev) => {
    if (!dev?.gatt) return;
    setStatus('scanning');
    addLog('Opnieuw verbinden…');
    try {
      deviceRef.current = dev;
      dev.addEventListener('gattserverdisconnected', onDisconnect);
      await attachDevice(dev);
    } catch (e) {
      setStatus('disconnected');
      deviceRef.current = null;
      addLog(e.message || 'Reconnection failed', 'err');
    }
  }, [onDisconnect, attachDevice, addLog]);

  // Query the Web Bluetooth API for devices this site connected to before,
  // so the instructor can reconnect the AED Simulator without the picker.
  useEffect(() => {
    if (!navigator.bluetooth?.getDevices) return;
    let cancelled = false;
    navigator.bluetooth.getDevices()
      .then((devs) => { if (!cancelled) setKnownDevices(devs); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Bluetooth.getAvailability(): is there a Bluetooth radio at all?
  // availabilitychanged fires when the user turns Bluetooth on/off.
  useEffect(() => {
    const bt = navigator.bluetooth;
    if (!bt?.getAvailability) return;
    let cancelled = false;
    bt.getAvailability()
      .then((a) => { if (!cancelled) setAvailable(a); })
      .catch(() => {});
    const onAvail = (e) => setAvailable(!!e.value);
    bt.addEventListener?.('availabilitychanged', onAvail);
    return () => {
      cancelled = true;
      bt.removeEventListener?.('availabilitychanged', onAvail);
    };
  }, []);

  const disconnect = useCallback(() => {
    deviceRef.current?.gatt?.disconnect();
  }, []);

  const writeLeds = useCallback(async (mask) => {
    const clamped = mask & 0x7f;  // 7 bits: 6 LEDs + buzzer
    ledMaskRef.current = clamped;
    setLedMaskState(clamped);     // always update UI, even without hardware
    if (!charLeds.current) return;
    try {
      await charLeds.current.writeValueWithoutResponse(new Uint8Array([clamped]));
    } catch(e) {
      addLog('LED write failed: ' + e.message, 'err');
    }
  }, [addLog]);

  const setLed = useCallback((bitName, on) => {
    const bit = LED_BITS[bitName];
    if (bit === undefined) return;
    const next = on
      ? (ledMaskRef.current | (1 << bit))
      : (ledMaskRef.current & ~(1 << bit));
    writeLeds(next);
  }, [writeLeds]);

  const setLedMask = useCallback((mask) => {
    writeLeds(mask);
  }, [writeLeds]);

  const allLedsOff = useCallback(() => writeLeds(0), [writeLeds]);

  // Simulate a momentary button press — fires the same handler as real hardware
  const simulateButton = useCallback((bit) => {
    const mask = 1 << bit;
    setBtnMask(mask);
    onBtnRef.current?.(mask);
    setTimeout(() => setBtnMask(0), 200);
  }, []);

  return {
    status, deviceName, ledMask, btnMask, log, knownDevices, available,
    connect, disconnect, reconnect,
    setLed, setLedMask, allLedsOff, writeLeds,
    simulateButton, addLog,
  };
}
