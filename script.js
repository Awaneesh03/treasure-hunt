// ============================================================
//  Treasure Hunt – Participant Page  (production-ready)
//  URL format:  yoursite.com/?clue=1
//  Requires:    config.js  →  SUPABASE_URL, SUPABASE_ANON_KEY
// ============================================================

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TEAM_KEY = 'teamName';  // localStorage key for team name

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

// ── Init ──────────────────────────────────────────────────────
// localStorage stores ONLY team name. All progression comes from DB.
async function init() {
  const params = new URLSearchParams(window.location.search);
  clueNum = parseInt(params.get('clue'), 10);

  if (!params.has('clue') || isNaN(clueNum) || clueNum < 1) {
    showError('Invalid QR code.');
    return;
  }

  // Only permitted localStorage read: team name
  teamName = localStorage.getItem(TEAM_KEY) || null;

  if (!teamName) {
    // Hard stop — never touch Supabase until team name is set
    $loading.style.display      = 'none';
    $questionCard.style.display = 'none';
    $teamScreen.style.display   = 'block';
    $teamInput.focus();
    return;
  }

  db.from('questions').select('id').limit(1).then(() => {});  // warm-up
  await fetchQuestion();
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
  localStorage.setItem(TEAM_KEY, teamName);  // only localStorage write in entire app

  $teamBtn.disabled         = true;
  $teamScreen.style.display = 'none';
  $loading.style.display    = 'block';

  fetchQuestion().finally(() => { $teamBtn.disabled = false; });
}

// ── Fetch question — progression driven entirely by Supabase ──
async function fetchQuestion() {
  const clueNumber = Number(clueNum);

  if (!clueNumber || clueNumber < 1) {
    showError('Invalid QR code.');
    return;
  }

  // ── 1. Sole source of truth: count DB rows for this team ─────
  //       If DB was reset → count = 0 → allowedClue = 1 always.
  const { count, error: countError } = await db
    .from('teams_progress')
    .select('*', { count: 'exact', head: true })
    .eq('team_name', teamName);

  if (countError) {
    showError('Could not verify your progress. Please try again.', true);
    return;
  }

  const solvedCount = count ?? 0;   // 0 when DB empty or after reset
  const allowedClue = solvedCount + 1;

  console.log('[TreasureHunt] team:', teamName, '| solvedCount:', solvedCount, '| allowedClue:', allowedClue, '| requested:', clueNumber);

  // ── 2. Block if skipping ahead ───────────────────────────────
  if (clueNumber > allowedClue) {
    showError(`You must solve Clue #${allowedClue} first.`);
    return;
  }

  // ── 3. Load question from DB ─────────────────────────────────
  const { data, error } = await db
    .from('questions')
    .select('id, order_number, question, answer, clue')
    .eq('order_number', clueNumber)
    .single();

  if (error || !data) {
    showError('This clue does not exist.');
    return;
  }

  currentQuestion = data;
  answered = false;  // reset guard for this page load

  $loading.style.display      = 'none';
  $questionCard.style.display = 'block';
  $progress.textContent       = `Clue #${clueNumber}  ·  ${teamName}`;
  $questionText.textContent   = data.question;

  // ── 4. Already solved — read-only view ───────────────────────
  if (clueNumber < allowedClue) {
    $answerInput.disabled = true;
    $submitBtn.disabled   = true;
    showClue(data.clue?.trim() || 'You already solved this clue!');
    return;
  }

  // ── 5. Exact next clue — allow answering ─────────────────────
  $answerInput.disabled = false;
  $submitBtn.disabled   = false;
  $answerInput.value    = '';
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
