// ============================================================
//  Treasure Hunt – Participant Page Logic
//  Each QR code links to:  yoursite.com/?clue=1
//                           yoursite.com/?clue=2  etc.
//  Depends on: config.js (SUPABASE_URL, SUPABASE_ANON_KEY)
// ============================================================

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TEAM_KEY = 'teamName';   // localStorage key

let currentQuestion = null;
let clueNum         = null;
let teamName        = null;
let answered        = false;   // guard against re-submit after correct answer

// ── DOM refs ──────────────────────────────────────────────────
const $loading       = document.getElementById('loading');
const $teamScreen    = document.getElementById('team-screen');
const $teamInput     = document.getElementById('team-input');
const $teamBtn       = document.getElementById('team-btn');
const $teamError     = document.getElementById('team-error');
const $questionCard  = document.getElementById('question-card');
const $errorDisplay  = document.getElementById('error-display');
const $progress      = document.getElementById('progress');
const $questionText  = document.getElementById('question-text');
const $answerSection = document.getElementById('answer-section');
const $answerInput   = document.getElementById('answer-input');
const $submitBtn     = document.getElementById('submit-btn');
const $feedback      = document.getElementById('feedback');
const $clueSection   = document.getElementById('clue-section');
const $clueText      = document.getElementById('clue-text');

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  $teamBtn.addEventListener('click', submitTeamName);
  $teamInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitTeamName();
  });

  $submitBtn.addEventListener('click', checkAnswer);
  $answerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkAnswer();
  });

  init();
});

// ── Read URL param, decide whether to ask for team name ───────
async function init() {
  const params = new URLSearchParams(window.location.search);
  clueNum = parseInt(params.get('clue'), 10);

  if (!params.has('clue') || isNaN(clueNum) || clueNum < 1) {
    showError('No clue number found. Make sure you scanned the correct QR code.');
    return;
  }

  // Check if team name is already stored
  teamName = localStorage.getItem(TEAM_KEY);

  if (!teamName) {
    // Ask for team name before loading the question
    $loading.style.display    = 'none';
    $teamScreen.style.display = 'block';
    $teamInput.focus();
  } else {
    // Team name known — go straight to the question
    await fetchQuestion();
  }
}

// ── Handle team name submission ───────────────────────────────
function submitTeamName() {
  const name = $teamInput.value.trim();

  if (!name) {
    $teamError.textContent = 'Please enter a team name.';
    $teamError.className   = 'feedback wrong';
    return;
  }

  teamName = name;
  localStorage.setItem(TEAM_KEY, teamName);

  $teamScreen.style.display = 'none';
  $loading.style.display    = 'block';
  fetchQuestion();
}

// ── Fetch the single question matching clueNum ────────────────
async function fetchQuestion() {
  const { data, error } = await db
    .from('questions')
    .select('id, order_number, question, answer, clue')
    .eq('order_number', clueNum)
    .single();

  if (error || !data) {
    showError(`Clue #${clueNum} does not exist yet. Ask the organiser!`);
    return;
  }

  currentQuestion = data;

  $loading.style.display      = 'none';
  $questionCard.style.display = 'block';
  $progress.textContent       = `Clue #${clueNum}  ·  ${teamName}`;
  $questionText.textContent   = data.question;
  $answerInput.focus();
}

// ── Validate the answer ───────────────────────────────────────
function checkAnswer() {
  if (answered) return;

  const userAnswer    = $answerInput.value.trim().toLowerCase();
  const correctAnswer = currentQuestion.answer.trim().toLowerCase();

  if (userAnswer === '') return;

  if (userAnswer === correctAnswer) {
    answered              = true;
    $submitBtn.disabled   = true;
    $answerInput.disabled = true;
    setFeedback('Correct! ✓', 'correct');

    // Save to Supabase in the background (don't block the UI)
    saveProgress();

    setTimeout(() => {
      const clue = currentQuestion.clue;
      showClue(clue && clue.trim()
        ? clue.trim()
        : 'Well done! Find the next QR code to continue.');
    }, 600);

  } else {
    setFeedback('Try again!', 'wrong');
    $answerInput.select();
  }
}

// ── Insert a row into teams_progress ─────────────────────────
async function saveProgress() {
  const { error } = await db
    .from('teams_progress')
    .insert({
      team_name:   teamName,
      clue_number: clueNum,
      solved_at:   new Date().toISOString()
    });

  // Error code 23505 = Postgres unique violation (already saved before).
  // This happens if the team refreshes the page and re-submits — safe to ignore.
  if (error && error.code !== '23505') {
    console.error('Could not save progress:', error.message);
  }
}

// ── Reveal the clue box ───────────────────────────────────────
function showClue(clueText) {
  $answerSection.style.display = 'none';
  $clueText.textContent        = clueText;
  $clueSection.style.display   = 'block';
}

// ── Error screen ──────────────────────────────────────────────
function showError(msg) {
  $loading.style.display      = 'none';
  $teamScreen.style.display   = 'none';
  $errorDisplay.textContent   = msg;
  $errorDisplay.style.display = 'block';
}

// ── Feedback helper ───────────────────────────────────────────
function setFeedback(text, type) {
  $feedback.textContent = text;
  $feedback.className   = `feedback ${type}`;
}
