// ============================================================
//  Treasure Hunt – Participant Page  (production-ready)
//  URL format:  yoursite.com/?clue=1
//  Requires:    config.js  →  SUPABASE_URL, SUPABASE_ANON_KEY
// ============================================================

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TEAM_KEY  = 'teamName';   // only localStorage keys permitted
const GROUP_KEY = 'groupName';

let currentQuestion = null;
let clueNum         = null;
let teamName        = null;
let groupName       = null;
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
// localStorage: team name + group only. All progression from DB.
async function init() {
  const params = new URLSearchParams(window.location.search);
  clueNum = parseInt(params.get('clue'), 10);

  if (!params.has('clue') || isNaN(clueNum) || clueNum < 1) {
    showError('Invalid QR code.');
    return;
  }

  const storedName = localStorage.getItem(TEAM_KEY) || null;

  if (!storedName) {
    showTeamScreen();
    return;
  }

  // Verify team exists in DB and retrieve group
  const { data, error } = await db
    .from('teams_progress')
    .select('team_name, group_name')
    .eq('team_name', storedName)
    .limit(1);

  if (error || !data || data.length === 0) {
    // Team not found in DB — clear stale localStorage and re-register
    localStorage.removeItem(TEAM_KEY);
    localStorage.removeItem(GROUP_KEY);
    showTeamScreen();
    return;
  }

  teamName  = storedName;
  groupName = data[0].group_name;
  localStorage.setItem(GROUP_KEY, groupName);

  db.from('questions').select('id').limit(1).then(() => {});  // warm-up
  await fetchQuestion();
}

function showTeamScreen() {
  $loading.style.display      = 'none';
  $questionCard.style.display = 'none';
  $teamScreen.style.display   = 'block';
  $teamInput.focus();
}

// ── Team name submission ──────────────────────────────────────
async function submitTeamName() {
  const name  = $teamInput.value.trim();
  const group = document.querySelector('input[name="group"]:checked')?.value;

  if (!name) {
    $teamError.textContent = 'Please enter a team name.';
    $teamError.className   = 'feedback wrong';
    return;
  }
  if (!group) {
    $teamError.textContent = 'Please select Red or Blue team.';
    $teamError.className   = 'feedback wrong';
    return;
  }

  $teamBtn.disabled         = true;
  $teamScreen.style.display = 'none';
  $loading.style.display    = 'block';

  // Check if team already registered in DB
  const { data: existing, error: checkError } = await db
    .from('teams_progress')
    .select('team_name, group_name')
    .eq('team_name', name)
    .limit(1);

  if (checkError) {
    showError('Could not register team. Please try again.', true);
    $teamBtn.disabled = false;
    return;
  }

  if (!existing || existing.length === 0) {
    // New team — insert registration row (clue_number=0 marks registration only)
    const { error: insertError } = await db
      .from('teams_progress')
      .insert({ team_name: name, group_name: group, clue_number: 0, solved_at: null });

    if (insertError && insertError.code !== '23505') {
      showError('Could not register team. Please try again.', true);
      $teamBtn.disabled = false;
      return;
    }
    groupName = group;
  } else {
    // Returning team — use group from DB
    groupName = existing[0].group_name;
  }

  teamName = name;
  localStorage.setItem(TEAM_KEY,  teamName);
  localStorage.setItem(GROUP_KEY, groupName);

  fetchQuestion().finally(() => { $teamBtn.disabled = false; });
}

// ── Fetch question — progression driven entirely by Supabase ──
async function fetchQuestion() {
  const clueNumber = Number(clueNum);

  if (!clueNumber || clueNumber < 1) {
    showError('Invalid QR code.');
    return;
  }

  // groupName must be set before this runs (via init() DB check or submitTeamName())
  if (!groupName) {
    showError('Group not set. Please clear your browser data and re-register.', true);
    return;
  }

  // ── 1. Count actual progress rows for this team (excl. registration row) ──
  const { count, error: countError } = await db
    .from('teams_progress')
    .select('*', { count: 'exact', head: true })
    .eq('team_name', teamName)
    .gt('clue_number', 0);

  if (countError) {
    showError('Could not verify your progress. Please try again.', true);
    return;
  }

  const solvedCount = count ?? 0;
  const allowedClue = solvedCount + 1;

  console.log('[TreasureHunt] team:', teamName, '| group:', groupName,
    '| solved:', solvedCount, '| allowed:', allowedClue, '| requested:', clueNumber);

  // ── 2. Block if skipping ahead ───────────────────────────────
  if (clueNumber > allowedClue) {
    showError(`You must solve Clue #${allowedClue} first.`);
    return;
  }

  // ── 3. Fetch by group_name + group_clue_number (per-group numbering) ──
  const { data, error } = await db
    .from('questions')
    .select('id, group_name, group_clue_number, question, answer, clue')
    .eq('group_name', groupName)
    .eq('group_clue_number', clueNumber)
    .single();

  if (error || !data) {
    showError('This clue does not exist for your group.');
    return;
  }

  currentQuestion = data;
  answered = false;

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
    group_name:  groupName,
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
