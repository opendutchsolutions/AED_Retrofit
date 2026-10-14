// BLS/AED scenario definition
// step types:
//   'button' — wait for trainee to press expect_button (with optional timeout)
//   'timed'  — auto-advance after duration_seconds
//   'branch' — instructor picks outcome from choices[]
//   'end'    — terminal step

export const LANGUAGES = ['Nederlands', 'Duits'];

export const AUDIO_FILES = {
  Nederlands: {
    warning:       'audio/Nederlands/1_ConnectPads.mp3',
    place_pads:    'audio/Nederlands/2_PlacePads.wav',
    analyse:       'audio/Nederlands/3_AnalyseRitme.wav',
    shock_advised: 'audio/Nederlands/4_ShockAdvised.wav',
    shock:         'audio/Nederlands/5_Shock.wav',
    dont_touch_patient: 'audio/Nederlands/5_5_dont_touch_patient.wav',
    shock_delivered: 'audio/Nederlands/5_6_shock_delivered.mp3',
    no_shock:      'audio/Nederlands/6_NoShock.wav',
    cpr:           'audio/Nederlands/7_CPR.wav',
    kindsleutel:   'audio/Nederlands/kindsleutel_geactiveerd.mp3',
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
    label: 'Aanzetten',
    instruction: 'Vraag de deelnemer de klep te openen en op de aan/uit-knop te drukken.',
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
    label: 'Verbind de elektroden met de AED',
    instruction: 'Controleer of de elektroden zijn verbonden met de AED.',
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
    label: 'Elektroden plaatsen',
    instruction: 'Laat de deelnemer de elektroden op de juiste plekken aanbrengen (borst en onderbuik).',
    type: 'branch',
    leds: { on_off: true, low_belly: true, breast: true },
    audioKey: 'place_pads',
    timeout_seconds: 60,
    choices: [
      { label: 'Elektroden correct geplaatst', next: 'analyse' },
      { label: 'Elektroden incorrect geplaatst', next: 'place-pads' },
    ],
  },
  {
    id: 'analyse',
    label: 'Ritme analyseren',
    instruction: 'De AED analyseert het ritme. Niemand mag de patiënt aanraken. Kies daarna de uitkomst.',
    type: 'branch',
    leds: { on_off: true, hands_off: true },
    audioKey: 'analyse',
    choices: [
      { label: 'Schok geadviseerd', next: 'shock-advised' },
      { label: 'Geen schok geadviseerd', next: 'no-shock' },
    ],
  },
  {
    id: 'shock-advised',
    label: 'Schok geadviseerd',
    instruction: 'De AED adviseert een schok. Zorg dat niemand de patiënt aanraakt en druk op de schokknop.',
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
    label: 'Schok wordt voorbereid',
    instruction: 'De AED laadt op voor de schok. Raak de patiënt niet aan.',
    type: 'timed',
    leds: { on_off: true },
    audioKey: 'shock',
    duration_seconds: 5,
    on_complete: 'post-shock-cpr2',
  },
  {
    id: 'post-shock-cpr2',
    label: 'Raak de patiënt niet aan',
    instruction: 'De schok wordt toegediend. Niemand mag de patiënt aanraken.',
    type: 'timed',
    leds: { on_off: true, buzzer: true },
    buzzer_duration_ms: 5000,
    audioKey: 'dont_touch_patient',
    duration_seconds: 5,
    on_complete: 'post-shock-cpr3',
  },
    {
    id: 'post-shock-cpr3',
    label: 'Schok toegediend',
    instruction: 'Schok toegediend. Start direct met reanimatie: 30 compressies, 2 ventilaties.',
    type: 'timed',
    leds: { on_off: true },
    audioKey: 'shock_delivered',
    duration_seconds: 2,
    on_complete: 'cpr-2',
  },
  {
    id: 'no-shock',
    label: 'Geen schok geadviseerd',
    instruction: 'Geen schokbaar ritme. Start direct met reanimatie: 30 compressies, 2 ventilaties.',
    type: 'timed',
    leds: { on_off: true },
    audioKey: 'no_shock',
    duration_seconds: 5,
    on_complete: 'cpr-2',
  },
  {
    id: 'analyse-2',
    label: 'Ritme heranalyseren',
    instruction: 'Tweede analysecyclus. Niemand mag de patiënt aanraken. Kies daarna de uitkomst.',
    type: 'branch',
    leds: { on_off: true, hands_off: true },
    audioKey: 'analyse',
    choices: [
      { label: 'Schok geadviseerd', next: 'shock-advised-2' },
      { label: 'Geen schok geadviseerd', next: 'rosc-or-continue' },
    ],
  },
  {
    id: 'shock-advised-2',
    label: 'Schok geadviseerd (2e)',
    instruction: 'Tweede schok geadviseerd. Zelfde procedure — zorg dat iedereen vrij is en druk op de schokknop.',
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
    label: 'Reanimatiecyclus',
    instruction: 'Ga door met reanimatie. Verhouding 30:2. Na 2 minuten volgt de heranalyse.',
    type: 'timed',
    leds: { on_off: true },
    audioKey: 'cpr',
    metronome: true,
    duration_seconds: 120,
    on_complete: 'analyse-2',
    choices: [
      { label: 'Heranalyseer hart-ritme', next: 'analyse-2' },
      { label: 'Beeindig scenario', next: 'end-scenario'},
    ],
  },
  {
    id: 'rosc-or-continue',
    label: 'ROSC of reanimatie voortzetten',
    instruction: 'Kies de uitkomst voor de patiënt.',
    type: 'branch',
    leds: { on_off: true },
    audioKey: null,
    choices: [
      { label: 'ROSC — spontane hartslag hersteld', next: 'end-scenario' },
      { label: 'Reanimatie voortzetten', next: 'cpr-2' },
    ],
  },
  {
    id: 'end-scenario',
    label: 'Scenario afgerond',
    instruction: 'Scenario beëindigd. Bekijk het logboek onder Afronden.',
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
