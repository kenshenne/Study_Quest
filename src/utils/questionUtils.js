/**
 * Shared question type enforcement rules.
 * These are the ONLY allowed question types per difficulty.
 */
export const ALLOWED_TYPES_BY_DIFFICULTY = {
  easy: ["multiple_choice"],
  medium: ["multiple_choice", "identification"],
  hard: ["multiple_choice", "identification", "enumeration", "fill_blank"]
};

/**
 * Filters a question pool to only include questions whose type is valid
 * for the given difficulty. Invalid questions are dropped.
 *
 * @param {Array} questions - Array of question objects from DB
 * @param {string} difficulty - "easy" | "medium" | "hard"
 * @returns {Array} filtered questions with only valid types
 */
export function filterQuestionsByDifficulty(questions, difficulty) {
  const allowed = ALLOWED_TYPES_BY_DIFFICULTY[difficulty] || ALLOWED_TYPES_BY_DIFFICULTY.easy;
  return questions.filter(q => allowed.includes(q.question_type));
}

/**
 * From a full question pool, return questions valid for the given difficulty.
 * Falls back to any difficulty's questions if the filtered pool is too small.
 *
 * @param {Array} allQuestions - All questions for a material
 * @param {string} difficulty - "easy" | "medium" | "hard"
 * @param {number} minRequired - Minimum questions needed (default 5)
 * @returns {Array} shuffled, valid question pool
 */
export function buildQuestionPool(allQuestions, difficulty, minRequired = 5) {
  const allowed = ALLOWED_TYPES_BY_DIFFICULTY[difficulty] || ALLOWED_TYPES_BY_DIFFICULTY.easy;

  // Primary: same difficulty + correct type
  const exact = allQuestions.filter(
    q => q.difficulty === difficulty && allowed.includes(q.question_type)
  );

  if (exact.length >= minRequired) {
    return shuffle(exact);
  }

  // Fallback: any question with a valid type for this difficulty (ignore stored difficulty)
  const typeFallback = allQuestions.filter(q => allowed.includes(q.question_type));
  if (typeFallback.length >= minRequired) {
    return shuffle(typeFallback);
  }

  // Last resort: return all questions (any type, any difficulty) — avoids empty game
  return shuffle(allQuestions);
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}