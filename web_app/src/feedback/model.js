// Instructor observations only: these are not measurements from the AED.
export const FEEDBACK_GROUPS = [
  { title: 'Veiligheid en handelen', questions: [
    { id: 'algemene-veiligheid', label: 'Algemene veiligheid', options: 'score' },
    { id: 'aed-gedacht', label: 'Aan de trainings-AED gedacht', options: 'score' },
    { id: 'elektroden', label: 'Plaatsing van de elektroden', options: 'score' },
    { id: 'schokveiligheid', label: 'Veiligheid bij het geven van de schok', options: 'score' },
    { id: 'bediening-aed', label: 'Bediening van de trainings-AED', options: 'score' },
  ] },
  { title: 'Kwaliteit van de reanimatie', questions: [
    { id: 'diepte', label: 'Diepte van de borstcompressies', options: ['Te ondiep', 'Goed', 'Te diep', 'Niet beoordeeld'] },
    { id: 'frequentie', label: 'Frequentie van de borstcompressies', options: ['Te langzaam', 'Goed', 'Te snel', 'Niet beoordeeld'] },
    { id: 'ontbloten', label: 'Borstkas volledig ontbloot', options: ['Onvoldoende', 'Goed', 'Niet beoordeeld'] },
    { id: 'onderbrekingen', label: 'Onderbrekingen van borstcompressies', options: ['Kort en beperkt', 'Te lang of te vaak', 'Niet beoordeeld'] },
    { id: 'beademing', label: 'Beademing', options: ['Te weinig lucht', 'Goed', 'Te veel lucht', 'Niet beoordeeld'] },
  ] },
  { title: 'Samenwerking en communicatie', questions: [
    { id: 'taakverdeling', label: 'Taakverdeling', options: ['Goed', 'Kan beter', 'Niet beoordeeld'] },
    { id: 'communicatie', label: 'Communicatie binnen het team', options: ['Goed', 'Kan beter', 'Niet beoordeeld'] },
    { id: 'leiderschap', label: 'Leiderschap en overzicht', options: ['Goed', 'Kan beter', 'Niet beoordeeld'] },
  ] },
  { title: 'Praktische uitvoering', questions: [
    { id: 'wisselen', label: 'Wisselen van hulpverlener', options: ['Goed uitgevoerd', 'Te laat', 'Onnodige onderbreking', 'Niet beoordeeld'] },
  ] },
];

export const FEEDBACK_QUESTIONS = FEEDBACK_GROUPS.flatMap(group => group.questions);

// Scenario IDs, not array indices: an edited/reordered scenario does not shift the prompts.
const PHASE_QUESTIONS = {
  'power-on': ['algemene-veiligheid', 'aed-gedacht'],
  'check-pads': ['aed-gedacht', 'bediening-aed'],
  'place-pads': ['elektroden'],
  'analyse': ['algemene-veiligheid', 'schokveiligheid'],
  'analyse-2': ['algemene-veiligheid', 'schokveiligheid'],
  'shock-advised': ['schokveiligheid', 'bediening-aed'],
  'shock-advised-2': ['schokveiligheid', 'bediening-aed'],
  'post-shock-cpr3': ['schokveiligheid', 'diepte'],
  'no-shock': ['diepte', 'frequentie'],
  'cpr-2': ['diepte', 'frequentie', 'taakverdeling'],
  'rosc-or-continue': ['communicatie', 'leiderschap'],
  'no-pulse': ['communicatie'],
  'end-scenario': ['taakverdeling'],
};

export function questionsForStep(id) {
  return PHASE_QUESTIONS[id] || [];
}

export function classifyAnswer(question, value) {
  if (!value || value === 'Niet beoordeeld' || value === 'Niet van toepassing') return 'neutral';
  if (question.options === 'score') return Number(value) >= 4 ? 'good' : Number(value) <= 2 ? 'attention' : 'neutral';
  return ['Goed', 'Kort en beperkt', 'Goed uitgevoerd'].includes(value) ? 'good' : 'attention';
}

export function summarizeFeedback(answers) {
  const entries = FEEDBACK_QUESTIONS.filter(question => answers[question.id]);
  return {
    answered: entries.length,
    strengths: entries.filter(question => classifyAnswer(question, answers[question.id]) === 'good').length,
    improvements: entries.filter(question => classifyAnswer(question, answers[question.id]) === 'attention').length,
  };
}

export const FEEDBACK_STORAGE_KEY = 'aed-retrofit-instructor-feedback-v1';

export function readSavedFeedback() {
  try {
    const saved = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || '{}');
    if (!saved || typeof saved !== 'object') return { answers: {}, note: '' };
    const answers = Object.fromEntries(FEEDBACK_QUESTIONS.flatMap(question => {
      const value = saved.answers?.[question.id];
      const options = question.options === 'score'
        ? ['0', '1', '2', '3', '4', '5', 'Niet beoordeeld', 'Niet van toepassing']
        : question.options;
      return options.includes(value) ? [[question.id, value]] : [];
    }));
    return { answers, note: typeof saved.note === 'string' ? saved.note.slice(0, 500) : '' };
  } catch {
    return { answers: {}, note: '' };
  }
}
