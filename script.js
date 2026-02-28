// ============================================================
//  Treasure Hunt – Participant Page Logic
//  Each QR code links to: yoursite.com/?clue=1
//                          yoursite.com/?clue=2  etc.
//  Depends on: config.js (SUPABASE_URL, SUPABASE_ANON_KEY)
// ============================================================

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentQuestion = null;
let answered        = false;   // prevent re-submission after correct answer

// ── DOM refs ──────────────────────────────────────────────────
const $loading       = document.getElementById('loading');
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
  $submitBtn.addEventListener('click', checkAnswer);
  $answerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkAnswer();
  });
  init();
});

// ── Read URL param and fetch the matching question ────────────
async function init() {
  const params  = new URLSearchParams(window.location.search);
  const clueNum = parseInt(params.get('clue'), 10);

  // Validate the URL param
  if (!params.has('clue') || isNaN(clueNum) || clueNum < 1) {
    showError('No clue number found. Make sure you scanned the correct QR code.');
    return;
  }

  // Fetch only this one question by order_number
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

  // Render
  $loading.style.display      = 'none';
  $questionCard.style.display = 'block';
  $progress.textContent       = `Clue #${clueNum}`;
  $questionText.textContent   = data.question;
  $answerInput.focus();
}

// ── Validate answer ───────────────────────────────────────────
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

    setTimeout(() => {
      const clue = currentQuestion.clue;
      // Show clue if set, otherwise a default nudge
      showClue(clue && clue.trim() ? clue.trim() : 'Well done! Find the next QR code to continue.');
    }, 600);

  } else {
    setFeedback('Try again!', 'wrong');
    $answerInput.select();
  }
}

// ── Reveal the clue box ───────────────────────────────────────
function showClue(clueText) {
  $answerSection.style.display = 'none';    // hide input + button
  $clueText.textContent        = clueText;
  $clueSection.style.display   = 'block';   // show clue
}

// ── Error screen ──────────────────────────────────────────────
function showError(msg) {
  $loading.style.display      = 'none';
  $errorDisplay.textContent   = msg;
  $errorDisplay.style.display = 'block';
}

// ── Feedback helper ───────────────────────────────────────────
function setFeedback(text, type) {
  $feedback.textContent = text;
  $feedback.className   = `feedback ${type}`;
}
