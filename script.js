// ============================================================
//  Treasure Hunt – Participant Page Logic
//  Depends on: config.js (SUPABASE_URL, SUPABASE_ANON_KEY)
// ============================================================

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PROGRESS_KEY = 'huntProgress';

let questions    = [];
let currentIndex = 0;
let isSubmitting = false;

// ── DOM refs ──────────────────────────────────────────────────
const $loading       = document.getElementById('loading');
const $questionCard  = document.getElementById('question-card');
const $completed     = document.getElementById('completed');
const $errorDisplay  = document.getElementById('error-display');
const $progress      = document.getElementById('progress');
const $questionText  = document.getElementById('question-text');
const $answerSection = document.getElementById('answer-section');
const $answerInput   = document.getElementById('answer-input');
const $submitBtn     = document.getElementById('submit-btn');
const $feedback      = document.getElementById('feedback');
const $clueSection   = document.getElementById('clue-section');
const $clueText      = document.getElementById('clue-text');
const $nextBtn       = document.getElementById('next-btn');

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  $submitBtn.addEventListener('click', checkAnswer);
  $answerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkAnswer();
  });
  $nextBtn.addEventListener('click', goNext);
  init();
});

// ── Fetch all questions once, restore saved progress ──────────
async function init() {
  const { data, error } = await db
    .from('questions')
    .select('id, order_number, question, answer, clue')
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

  if (isNaN(currentIndex) || currentIndex < 0) currentIndex = 0;

  if (currentIndex >= questions.length) {
    showCompleted();
  } else {
    showQuestion(currentIndex);
  }
}

// ── Render a question ─────────────────────────────────────────
function showQuestion(index) {
  $loading.style.display      = 'none';
  $completed.style.display    = 'none';
  $errorDisplay.style.display = 'none';
  $questionCard.style.display = 'block';

  // Always start with answer section visible, clue hidden
  $answerSection.style.display = 'block';
  $clueSection.style.display   = 'none';

  $progress.textContent     = `Question ${index + 1} of ${questions.length}`;
  $questionText.textContent = questions[index].question;

  $answerInput.value    = '';
  $answerInput.disabled = false;
  $submitBtn.disabled   = false;
  $feedback.textContent = '';
  $feedback.className   = 'feedback';
  isSubmitting          = false;

  $answerInput.focus();
}

// ── Validate answer ───────────────────────────────────────────
function checkAnswer() {
  if (isSubmitting) return;

  const userAnswer    = $answerInput.value.trim().toLowerCase();
  const correctAnswer = questions[currentIndex].answer.trim().toLowerCase();

  if (userAnswer === '') return;

  if (userAnswer === correctAnswer) {
    isSubmitting          = true;
    $submitBtn.disabled   = true;
    $answerInput.disabled = true;
    setFeedback('Correct! ✓', 'correct');

    // Advance index and save progress immediately
    currentIndex++;
    localStorage.setItem(PROGRESS_KEY, String(currentIndex));

    const clue = questions[currentIndex - 1].clue;  // clue belongs to the question just answered

    setTimeout(() => {
      if (clue && clue.trim() !== '') {
        // Show the clue — user must click "Next Question" to proceed
        showClue(clue.trim());
      } else {
        // No clue — advance automatically
        advanceOrComplete();
      }
    }, 600);

  } else {
    setFeedback('Try again!', 'wrong');
    $answerInput.select();
  }
}

// ── Show the clue box ─────────────────────────────────────────
function showClue(clueText) {
  $answerSection.style.display = 'none';   // hide input + submit
  $clueText.textContent        = clueText;
  $clueSection.style.display   = 'block';  // show clue + next button
}

// ── "Next Question →" button handler ─────────────────────────
function goNext() {
  advanceOrComplete();
}

// ── Move to next question or show completion ──────────────────
function advanceOrComplete() {
  if (currentIndex >= questions.length) {
    showCompleted();
  } else {
    showQuestion(currentIndex);
  }
}

// ── Completion screen ─────────────────────────────────────────
function showCompleted() {
  $loading.style.display      = 'none';
  $questionCard.style.display = 'none';
  $errorDisplay.style.display = 'none';
  $completed.style.display    = 'block';
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
