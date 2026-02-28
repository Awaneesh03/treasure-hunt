// ============================================================
//  Treasure Hunt – Participant Page Logic
//  Depends on: config.js (SUPABASE_URL, SUPABASE_ANON_KEY)
// ============================================================

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PROGRESS_KEY = 'huntProgress';

let questions    = [];   // all questions sorted by order_number
let currentIndex = 0;   // index of the question currently on screen
let isSubmitting = false; // guard against double-submit

// ── DOM refs ──────────────────────────────────────────────────
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
  $answerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkAnswer();
  });
  init();
});

// ── Fetch all questions once, then restore progress ───────────
async function init() {
  const { data, error } = await db
    .from('questions')
    .select('id, order_number, question, answer')
    .order('order_number', { ascending: true });

  if (error) {
    showError('Could not load questions. Check your Supabase config.');
    return;
  }

  if (!data || data.length === 0) {
    showError('No questions found. Add some from the admin panel.');
    return;
  }

  questions    = data;
  currentIndex = parseInt(localStorage.getItem(PROGRESS_KEY) || '0', 10);

  // Sanitise saved value in case questions were deleted
  if (isNaN(currentIndex) || currentIndex < 0) currentIndex = 0;

  if (currentIndex >= questions.length) {
    showCompleted();
  } else {
    showQuestion(currentIndex);
  }
}

// ── Render a question by index ────────────────────────────────
function showQuestion(index) {
  // Hide every other section
  $loading.style.display      = 'none';
  $completed.style.display    = 'none';
  $errorDisplay.style.display = 'none';

  // Show question card
  $questionCard.style.display = 'block';

  // Populate content
  $progress.textContent     = `Question ${index + 1} of ${questions.length}`;
  $questionText.textContent = questions[index].question;

  // Reset input and feedback for the new question
  $answerInput.value    = '';
  $answerInput.disabled = false;
  $submitBtn.disabled   = false;
  $feedback.textContent = '';
  $feedback.className   = 'feedback';
  isSubmitting          = false;

  $answerInput.focus();
}

// ── Validate answer and advance ───────────────────────────────
function checkAnswer() {
  // Prevent double-submit while transitioning
  if (isSubmitting) return;

  const userAnswer    = $answerInput.value.trim().toLowerCase();
  const correctAnswer = questions[currentIndex].answer.trim().toLowerCase();

  if (userAnswer === '') return;  // ignore empty submit

  if (userAnswer === correctAnswer) {
    // Lock UI immediately so user can't submit twice
    isSubmitting          = true;
    $submitBtn.disabled   = true;
    $answerInput.disabled = true;
    setFeedback('Correct! ✓', 'correct');

    // Advance index and persist progress
    currentIndex++;
    localStorage.setItem(PROGRESS_KEY, String(currentIndex));

    // Brief pause so user sees the "Correct!" feedback, then move on
    setTimeout(() => {
      if (currentIndex >= questions.length) {
        showCompleted();
      } else {
        showQuestion(currentIndex);   // ← next clue appears here
      }
    }, 800);

  } else {
    setFeedback('Try again!', 'wrong');
    $answerInput.select();
  }
}

// ── Completion screen ─────────────────────────────────────────
function showCompleted() {
  $loading.style.display      = 'none';
  $questionCard.style.display = 'none';
  $errorDisplay.style.display = 'none';
  $completed.style.display    = 'block';
  // Clear saved progress so a fresh start is possible on next visit
  localStorage.removeItem(PROGRESS_KEY);
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
