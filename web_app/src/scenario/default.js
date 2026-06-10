// BLS/AED scenario definition
// step types:
//   'button' — wait for trainee to press expect_button (with optional timeout)
//   'timed'  — auto-advance after duration_seconds
//   'branch' — instructor picks outcome from choices[]
//   'end'    — terminal step

export const LANGUAGES = ['Nederlands', 'Duits'];

export const AUDIO_FILES = {
  Nederlands: {
    warning:       'audio/Nederlands/1_Warning.mp3',
    place_pads:    'audio/Nederlands/2_PlacePads.wav',
    analyse:       'audio/Nederlands/3_AnalyseRitme.wav',
    shock_advised: 'audio/Nederlands/4_ShockAdvised.wav',
    shock:         'audio/Nederlands/5_Shock.wav',
    dont_touch_patient: 'audio/Nederlands/5_5_dont_touch_patient.wav',
    shock_delivered: 'audio/Nederlands/5_6_shock_delivered.wav',
    no_shock:      'audio/Nederlands/6_NoShock.wav',
    cpr:           'audio/Nederlands/7_CPR.wav',
  },
  Duits: {
    warning:       'audio/Duits/Warning.wav',
    place_pads:    'audio/Duits/Pads.wav',
    analyse:       'audio/Duits/Analyse.wav',
    shock_advised: 'audio/Duits/YesAdvis.wav',
    shock:         'audio/Duits/Shock.wav',
    no_shock:      'audio/Duits/NoAdvis.wav',
    cpr:           'audio/Duits/CPR.wav',
  },
};

// Build scenario steps with audio key refs (resolved at runtime per language)
export const DEFAULT_STEPS = [
  {
    id: 'power-on',
    label: 'Power on',
    instruction: 'Ask trainee to open device lid and press the power button.',
    type: 'button',
    leds: { on_off: true },
    audioKey: null,
    expect_button: 'on_off',
    timeout_seconds: 30,
    on_correct: 'check-pads',
    on_timeout: 'power-on',
  },
  {
    id: 'check-pads',
    label: 'Check / insert pads',
    instruction: 'Confirm pads card is inserted. AED will prompt pad placement.',
    type: 'button',
    leds: { on_off: true, info: true },
    audioKey: 'warning',
    expect_button: 'pads_inserted',
    timeout_seconds: 60,
    on_correct: 'place-pads',
    on_timeout: 'check-pads',
  },
  {
    id: 'place-pads',
    label: 'Place pads on patient',
    instruction: 'Instruct trainee to attach electrode pads per diagram (breast + low belly).',
    type: 'branch',
    leds: { on_off: true, low_belly: true, breast: true },
    audioKey: 'place_pads',
    timeout_seconds: 60,
    choices: [
      { label: 'Pads incorrectly placed', next: 'place-pads' },
      { label: 'Pads correctly placed', next: 'analyse' },
    ],
  },
  {
    id: 'analyse',
    label: 'Analysing rhythm',
    instruction: 'AED is analysing. Ensure nobody touches patient. Select outcome after audio.',
    type: 'branch',
    leds: { on_off: true, hands_off: true },
    audioKey: 'analyse',
    choices: [
      { label: 'Shockable — VF / pVT', next: 'shock-advised' },
      { label: 'Non-shockable — PEA / Asystole', next: 'no-shock' },
    ],
  },
  {
    id: 'shock-advised',
    label: 'Shock advised',
    instruction: 'AED advises shock. Instruct trainee to ensure nobody touches patient and press shock.',
    type: 'button',
    leds: { on_off: true, shock: true, hands_off: true },
    audioKey: 'shock_advised',
    expect_button: 'shock',
    timeout_seconds: 30,
    on_correct: 'post-shock-cpr',
    on_timeout: 'shock-advised',
  },
  {
    id: 'post-shock-cpr',
    label: 'Delivering shock',
    instruction: 'Shock delivered. Start CPR immediately: 30 compressions, 2 breaths. 2 minutes.',
    type: 'timed',
    leds: { on_off: true },
    audioKey: 'shock',
    duration_seconds: 5,
    on_complete: 'post-shock-cpr2',
  },
  {
    id: 'post-shock-cpr2',
    label: 'Dont touch patient',
    instruction: 'Dont touch patient',
    type: 'timed',
    leds: { on_off: true, buzzer: true },
    buzzer_duration_ms: 5000,
    audioKey: 'dont_touch_patient',
    duration_seconds: 5,
    on_complete: 'post-shock-cpr3',
  },
    {
    id: 'post-shock-cpr3',
    label: 'Shock delivered',
    instruction: 'Shock delivered. Start CPR immediately: 30 compressions, 2 breaths. 2 minutes.',
    type: 'timed',
    leds: { on_off: true },
    audioKey: 'shock_delivered',
    duration_seconds: 5,
    on_complete: 'analyse-2',
  },
  {
    id: 'no-shock',
    label: 'No shock advised',
    instruction: 'No shockable rhythm. Start CPR immediately: 30 compressions, 2 breaths. 2 minutes.',
    type: 'timed',
    leds: { on_off: true },
    audioKey: 'no_shock',
    duration_seconds: 5,
    on_complete: 'cpr-2',
  },
  {
    id: 'analyse-2',
    label: 'Re-analysing rhythm',
    instruction: 'Second analysis cycle. Select outcome after audio.',
    type: 'branch',
    leds: { on_off: true, hands_off: true },
    audioKey: 'analyse',
    choices: [
      { label: 'Shockable — VF / pVT', next: 'shock-advised-2' },
      { label: 'Non-shockable — ROSC / Asystole', next: 'rosc-or-continue' },
    ],
  },
  {
    id: 'shock-advised-2',
    label: 'Shock advised (2nd)',
    instruction: 'Second shock advised. Same procedure — clear patient, press shock.',
    type: 'button',
    leds: { on_off: true, shock: true, hands_off: true },
    audioKey: 'shock_advised',
    expect_button: 'shock',
    timeout_seconds: 30,
    on_correct: 'cpr-2',
    on_timeout: 'shock-advised-2',
  },
  {
    id: 'cpr-2',
    label: 'CPR cycle 2',
    instruction: 'Continue CPR. 30:2 ratio. 2 minutes.',
    type: 'timed',
    leds: { on_off: true },
    audioKey: 'cpr',
    duration_seconds: 120,
    choices: [
      { label: 'Heranalyseer hart-ritme', next: 'analyse-2' },
      { label: 'Beeindig scenario', next: 'end-scenario'},
    ],
  },
  {
    id: 'rosc-or-continue',
    label: 'ROSC / Continue CPR',
    instruction: 'Select patient outcome.',
    type: 'branch',
    leds: { on_off: true },
    audioKey: null,
    choices: [
      { label: 'ROSC — Return of spontaneous circulation', next: 'end-scenario' },
      { label: 'Continue CPR cycle', next: 'cpr-2' },
    ],
  },
  {
    id: 'end-scenario',
    label: 'Scenario complete',
    instruction: 'Scenario ended. Review session log below.',
    type: 'end',
    leds: {},
    audioKey: null,
  },
];

export function buildStepMap(steps) {
  return Object.fromEntries(steps.map(s => [s.id, s]));
}

export function ledMaskFromObj(obj = {}) {
  const BITS = { shock:0, on_off:1, info:2, hands_off:3, low_belly:4, breast:5, buzzer:6 };
  let mask = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (v && BITS[k] !== undefined) mask |= (1 << BITS[k]);
  }
  return mask;
}
