// ============================================================
//  Treasure Hunt – Participant Page  (production-ready)
//  URL format:  yoursite.com/?clue=1
//  Requires:    config.js  →  SUPABASE_URL, SUPABASE_ANON_KEY
// ============================================================

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TEAM_KEY = 'teamName';          // localStorage key for team name
const SOLVED_KEY = n => `solved_${n}`;// localStorage key per solved clue

let currentQuestion = null;
let clueNum         = null;
let teamName        = null;
let answered        = false;  // guard against double-submit

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
  $teamInput.addEventListener('keypress', e => { if (e.key === 'Enter') submitTeamName(); });

  $submitBtn.addEventListener('click', checkAnswer);
  $answerInput.addEventListener('keypress', e => { if (e.key === 'Enter') checkAnswer(); });

  init();
});

// ── Init: validate URL param, check sequential order, show team screen or question ──
async function init() {
  // Warm up Supabase connection so the first real query is instant
  db.from('questions').select('id').limit(1).then(() => {});

  const params = new URLSearchParams(window.location.search);
  clueNum = parseInt(params.get('clue'), 10);

  if (!params.has('clue') || isNaN(clueNum) || clueNum < 1) {
    showError('No clue number found. Make sure you scanned the correct QR code.');
    return;
  }

  // Prevent skipping ahead: clue N requires clue N-1 to be solved first
  if (clueNum > 1 && !localStorage.getItem(SOLVED_KEY(clueNum - 1))) {
    showError(`You must solve Clue #${clueNum - 1} before this one!`);
    return;
  }

  teamName = localStorage.getItem(TEAM_KEY);

  if (!teamName) {
    $loading.style.display    = 'none';
    $teamScreen.style.display = 'block';
    $teamInput.focus();
  } else {
    await fetchQuestion();
  }
}

// ── Team name submission ──────────────────────────────────────
function submitTeamName() {
  const name = $teamInput.value.trim();

  if (!name) {
    $teamError.textContent = 'Please enter a team name.';
    $teamError.className   = 'feedback wrong';
    return;
  }

  teamName = name;
  localStorage.setItem(TEAM_KEY, teamName);

  $teamBtn.disabled         = true;  // prevent double-tap
  $teamScreen.style.display = 'none';
  $loading.style.display    = 'block';

  fetchQuestion().finally(() => { $teamBtn.disabled = false; });
}

// ── Fetch the single question for this clue number ────────────
async function fetchQuestion() {
  const clueNumber = Number(clueNum);

  // Debug: confirm what clue number was read from the URL
  console.log('[TreasureHunt] clue param from URL:', clueNumber);

  if (!clueNumber || clueNumber < 1) {
    showError('Invalid QR code.');
    return;
  }

  const { data, error } = await db
    .from('questions')
    .select('id, order_number, question, answer, clue')
    .eq('order_number', clueNumber)
    .single();

  // Debug: confirm what Supabase returned
  console.log('[TreasureHunt] Supabase result:', { clueNumber, data, error });

  if (error || !data) {
    showError('This clue does not exist.');
    return;
  }

  currentQuestion = data;

  $loading.style.display      = 'none';
  $questionCard.style.display = 'block';
  $progress.textContent       = `Clue #${clueNumber}  ·  ${teamName}`;
  $questionText.textContent   = data.question;
  $answerInput.focus();
}

// ── Answer validation ─────────────────────────────────────────
function checkAnswer() {
  if (answered) return;

  const userAnswer    = $answerInput.value.trim().toLowerCase();
  const correctAnswer = currentQuestion.answer.trim().toLowerCase();

  if (!userAnswer) return;

  if (userAnswer === correctAnswer) {
    answered              = true;
    $submitBtn.disabled   = true;
    $answerInput.disabled = true;
    setFeedback('Correct! ✓', 'correct');

    saveProgress();  // fire-and-forget

    setTimeout(() => {
      const clue = currentQuestion.clue;
      showClue(clue && clue.trim()
        ? clue.trim()
        : 'Well done! Find the next QR code to continue.');
    }, 600);

  } else {
    setFeedback('Try again!', 'wrong');
    // Shake the input field on wrong answer
    $answerInput.classList.remove('shake');
    void $answerInput.offsetWidth;       // force reflow to restart animation
    $answerInput.classList.add('shake');
    $answerInput.select();
  }
}

// ── Save progress to Supabase with one retry ─────────────────
async function saveProgress() {
  const payload = {
    team_name:   teamName,
    clue_number: clueNum,
    solved_at:   new Date().toISOString()
  };

  let { error } = await db.from('teams_progress').insert(payload);

  if (error && error.code !== '23505') {
    // Retry once after 2 seconds
    await new Promise(r => setTimeout(r, 2000));
    ({ error } = await db.from('teams_progress').insert(payload));
    if (error && error.code !== '23505') {
      console.error('Progress save failed after retry:', error.message);
      return;
    }
  }

  // Mark locally so sequential enforcement works on the next clue
  localStorage.setItem(SOLVED_KEY(clueNum), '1');
}

// ── Reveal the clue box ───────────────────────────────────────
function showClue(clueText) {
  $answerSection.style.display = 'none';
  $clueText.textContent        = clueText;
  $clueSection.style.display   = 'block';
}

// ── Error screen (retryable shows a reload button) ────────────
function showError(msg, retryable = false) {
  $loading.style.display      = 'none';
  $teamScreen.style.display   = 'none';
  $errorDisplay.innerHTML     = escHtml(msg)
    + (retryable
        ? '<br><br><button onclick="location.reload()" '
          + 'style="padding:0.5rem 1rem;background:#333;color:#fff;border:none;'
          + 'border-radius:5px;cursor:pointer;width:auto">Try Again</button>'
        : '');
  $errorDisplay.style.display = 'block';
}

// ── Helpers ───────────────────────────────────────────────────
function setFeedback(text, type) {
  $feedback.textContent = text;
  $feedback.className   = `feedback ${type}`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
