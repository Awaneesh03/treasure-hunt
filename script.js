// ============================================================
//  Treasure Hunt – Participant Page  (production-ready)
//  URL format:  yoursite.com/?clue=N
//  Requires:    config.js  →  SUPABASE_URL, SUPABASE_ANON_KEY
//  DB model:    ONE row per team in teams_progress.
//               clue_number = group-local clue they are currently ON (1-5).
//               Starts at 1 on registration; incremented by UPDATE
//               after each correct answer.
//
//  QR code mapping:
//    blue  →  ?clue=1..5   maps to group_clue_number 1..5  (offset 0)
//    red   →  ?clue=6..10  maps to group_clue_number 1..5  (offset 5)
// ============================================================

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TEAM_KEY = 'teamName';   // only localStorage key used

// URL clue offset per group: group_clue_number = URL clueNum - offset
const GROUP_CLUE_OFFSET = { red: 5, blue: 0 };

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

  // Fetch team's current row from DB (single row per team)
  const { data: team, error } = await db
    .from('teams_progress')
    .select('team_name, group_name, clue_number')
    .eq('team_name', storedName)
    .maybeSingle();

  if (error || !team) {
    // Team not found — clear stale localStorage and re-register
    localStorage.removeItem(TEAM_KEY);
    showTeamScreen();
    return;
  }

  teamName  = storedName;
  groupName = team.group_name;

  await fetchQuestion(team.clue_number);
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

  // Check if team already has a row in DB
  const { data: existing, error: checkError } = await db
    .from('teams_progress')
    .select('team_name, group_name, clue_number')
    .eq('team_name', name)
    .maybeSingle();

  if (checkError) {
    showError('Could not register team. Please try again.', true);
    $teamBtn.disabled = false;
    return;
  }

  let teamClueNumber;

  if (!existing) {
    // New team — insert single row with clue_number = 1 (they start on clue 1)
    const { error: insertError } = await db
      .from('teams_progress')
      .insert({
        team_name:   name,
        group_name:  group,
        clue_number: 1,
        solved_at:   new Date().toISOString()
      });

    if (insertError && insertError.code !== '23505') {
      showError('Could not register team. Please try again.', true);
      $teamBtn.disabled = false;
      return;
    }

    groupName      = group;
    teamClueNumber = 1;
  } else {
    // Returning team — always use group + position from DB
    groupName      = existing.group_name;
    teamClueNumber = existing.clue_number;
  }

  teamName = name;
  localStorage.setItem(TEAM_KEY, teamName);

  fetchQuestion(teamClueNumber).finally(() => { $teamBtn.disabled = false; });
}

// ── Fetch question — progression driven entirely by Supabase ──
// teamClueNumber: the clue the team is currently on (from DB row)
async function fetchQuestion(teamClueNumber) {
  const clueNumber = Number(clueNum);

  if (!clueNumber || clueNumber < 1) {
    showError('Invalid QR code.');
    return;
  }

  if (!groupName) {
    showError('Group not set. Please clear your browser data and re-register.', true);
    return;
  }

  // If called without teamClueNumber, fetch fresh from DB (safety fallback)
  if (teamClueNumber === undefined) {
    const { data: team, error } = await db
      .from('teams_progress')
      .select('clue_number, group_name')
      .eq('team_name', teamName)
      .maybeSingle();

    if (error || !team) {
      localStorage.removeItem(TEAM_KEY);
      showTeamScreen();
      return;
    }

    groupName      = team.group_name;
    teamClueNumber = team.clue_number;
  }

  // Translate URL clue number → group-local clue number (1-5 for both groups)
  const offset          = GROUP_CLUE_OFFSET[groupName] ?? 0;
  const groupClueNumber = clueNumber - offset;

  if (groupClueNumber < 1) {
    showError('This QR code is not for your group.');
    return;
  }

  console.log('[TreasureHunt] team:', teamName, '| group:', groupName,
    '| teamClue:', teamClueNumber, '| groupClue:', groupClueNumber);

  // ── Block if trying to skip ahead ────────────────────────────
  if (groupClueNumber > teamClueNumber) {
    showError(`You must solve Clue #${teamClueNumber} first.`);
    return;
  }

  // ── Fetch question by group + group-local clue number ─────────
  const { data, error } = await db
    .from('questions')
    .select('id, group_name, group_clue_number, question, answer, clue')
    .eq('group_name', groupName)
    .eq('group_clue_number', groupClueNumber)
    .single();

  if (error || !data) {
    showError('This clue does not exist for your group.');
    return;
  }

  currentQuestion = data;
  answered        = false;

  $loading.style.display      = 'none';
  $questionCard.style.display = 'block';
  $progress.textContent       = `Clue #${groupClueNumber}  ·  ${teamName}`;
  $questionText.textContent   = data.question;

  // ── Already solved — read-only view ───────────────────────────
  if (groupClueNumber < teamClueNumber) {
    $answerSection.style.display = 'block';
    $clueSection.style.display   = 'none';
    $answerInput.disabled        = true;
    $submitBtn.disabled          = true;
    showClue(data.clue?.trim() || 'You already solved this clue!');
    return;
  }

  // ── Current clue — allow answering ────────────────────────────
  $answerSection.style.display = 'block';
  $clueSection.style.display   = 'none';
  $answerInput.disabled        = false;
  $submitBtn.disabled          = false;
  $answerInput.value           = '';
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
    $answerInput.classList.remove('shake');
    void $answerInput.offsetWidth;       // force reflow to restart animation
    $answerInput.classList.add('shake');
    $answerInput.select();
  }
}

// ── Save progress — UPDATE single row, advance clue_number ────
async function saveProgress() {
  const nextClue = currentQuestion.group_clue_number + 1;

  const { error } = await db
    .from('teams_progress')
    .update({ clue_number: nextClue, solved_at: new Date().toISOString() })
    .eq('team_name', teamName);

  if (error) {
    // Retry once after 2 seconds
    await new Promise(r => setTimeout(r, 2000));
    const { error: retryError } = await db
      .from('teams_progress')
      .update({ clue_number: nextClue, solved_at: new Date().toISOString() })
      .eq('team_name', teamName);
    if (retryError) {
      console.error('Progress save failed after retry:', retryError.message);
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
