// ============================================================
//  Treasure Hunt – Participant Page Logic
//  Depends on: config.js (SUPABASE_URL, SUPABASE_ANON_KEY)
// ============================================================

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Progress is stored in localStorage so a page refresh keeps their place.
// Value = the index (0-based) of the question they should see next.
const PROGRESS_KEY = 'huntProgress';

let questions    = [];   // all questions, sorted by order_number
let currentIndex = 0;   // which question is on screen right now

// ── DOM references ────────────────────────────────────────────
const $loading      = document.getElementById('loading');
const $questionCard = document.getElementById('question-card');
const $completed    = document.getElementById('completed');
const $errorDisplay = document.getElementById('error-display');
const $progress     = document.getElementById('progress');
const $questionText = document.getElementById('question-text');
const $answerInput  = document.getElementById('answer-input');
const $submitBtn    = document.getElementById('submit-btn');
const $feedback     = document.getElementById('feedback');

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  $submitBtn.addEventListener('click', checkAnswer);

  // Allow pressing Enter to submit
  $answerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkAnswer();
  });

  init();
});

// ── Fetch questions and decide where to start ─────────────────
async function init() {
  const { data, error } = await db
    .from('questions')
    .select('id, order_number, question, answer')
    .order('order_number', { ascending: true });

  if (error) {
    showError('Could not load questions. Check your Supabase config in config.js.');
    return;
  }

  if (!data || data.length === 0) {
    showError('No questions found. Add some using the admin panel.');
    return;
  }

  questions    = data;
  currentIndex = parseInt(localStorage.getItem(PROGRESS_KEY) || '0', 10);

  // Clamp in case questions were deleted since last visit
  if (isNaN(currentIndex) || currentIndex < 0) currentIndex = 0;

  if (currentIndex >= questions.length) {
    showCompleted();
  } else {
    showQuestion(currentIndex);
  }
}

// ── Display a question ────────────────────────────────────────
function showQuestion(index) {
  hide($loading);
  show($questionCard);
  hide($completed);

  const q = questions[index];
  $progress.textContent     = `Question ${index + 1} of ${questions.length}`;
  $questionText.textContent = q.question;
  $answerInput.value        = '';
  $feedback.textContent     = '';
  $feedback.className       = 'feedback';
  $answerInput.focus();
}

// ── Check the submitted answer ────────────────────────────────
function checkAnswer() {
  const userAnswer    = $answerInput.value.trim().toLowerCase();
  const correctAnswer = questions[currentIndex].answer.trim().toLowerCase();

  if (userAnswer === '') return;   // ignore empty submit

  if (userAnswer === correctAnswer) {
    // Correct!
    setFeedback('Correct! ✓', 'correct');
    $submitBtn.disabled    = true;
    $answerInput.disabled  = true;

    currentIndex++;
    localStorage.setItem(PROGRESS_KEY, String(currentIndex));

    setTimeout(() => {
      $submitBtn.disabled   = false;
      $answerInput.disabled = false;

      if (currentIndex >= questions.length) {
        showCompleted();
      } else {
        showQuestion(currentIndex);
      }
    }, 900);

  } else {
    // Wrong
    setFeedback('Try again!', 'wrong');
    $answerInput.select();
  }
}

// ── Show the completion screen ────────────────────────────────
function showCompleted() {
  hide($loading);
  hide($questionCard);
  show($completed);
}

// ── Show an error message ─────────────────────────────────────
function showError(msg) {
  hide($loading);
  $errorDisplay.textContent = msg;
  show($errorDisplay);
}

// ── Helpers ───────────────────────────────────────────────────
function show(el) { el.style.display = 'block'; }
function hide(el) { el.style.display = 'none';  }

function setFeedback(text, type) {
  $feedback.textContent = text;
  $feedback.className   = `feedback ${type}`;
}
