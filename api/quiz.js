/**
 * GET /api/quiz
 * GET /api/quiz?locationId=solar-panels
 *
 * API Layer — serves quiz questions from public/data/quiz.json.
 *
 * Without a locationId, returns all quiz sets (useful for prefetching).
 * With a locationId, returns questions for that specific location only.
 * Answer indices are STRIPPED from the response so the client cannot
 * cheat by inspecting the API payload — answers are validated server-side
 * via POST /api/scores (or checked client-side by QuizEngine after the
 * user submits).
 *
 * Note on answer omission:
 *   The `answer` field (correct option index) is removed before sending.
 *   This is a common API design pattern for quiz/exam systems — the
 *   answer key is never exposed in the question-fetch response.
 *
 * Query parameters
 *   ?locationId=<id>   Filter to a single location's questions.
 *                      Returns 404 if the locationId is not found.
 *
 * Response (all locations)
 *   200 { quizSets: QuizSet[], totalQuestions: number }
 *
 * Response (single location)
 *   200 { locationId, topic, questions: Question[], questionCount: number }
 *   404 { error: string }
 *   500 { error: string }
 *
 * Big-O
 *   Load all:              O(n * q)  — n locations, q questions each
 *   Filter by locationId:  O(n) scan then O(q) strip answers
 */

const fs   = require('fs');
const path = require('path');

const QUIZ_PATH = path.join(__dirname, '..', 'public', 'data', 'quiz.json');

/**
 * Strip the `answer` field from every question so the correct index
 * is never sent to the client in the questions payload.
 * @param {object[]} questions
 * @returns {object[]}
 */
function stripAnswers(questions) {
  return questions.map(({ answer: _omit, ...rest }) => rest);
}

module.exports = (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  let quizData;
  try {
    quizData = JSON.parse(fs.readFileSync(QUIZ_PATH, 'utf8'));
  } catch (err) {
    console.error('[api/quiz] Failed to read data file:', err.message);
    return res.status(500).json({ error: 'Could not load quiz data' });
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
  res.setHeader('Content-Type', 'application/json');

  const { locationId } = req.query;

  // ── Single location ──────────────────────────────────────────────────────
  if (locationId) {
    const entry = quizData.find(e => e.locationId === locationId);
    if (!entry) {
      return res.status(404).json({
        error: `No quiz found for locationId "${locationId}"`,
      });
    }
    return res.status(200).json({
      locationId:    entry.locationId,
      topic:         entry.topic,
      questions:     stripAnswers(entry.questions),
      questionCount: entry.questions.length,
    });
  }

  // ── All locations ────────────────────────────────────────────────────────
  const quizSets = quizData.map(entry => ({
    locationId:    entry.locationId,
    topic:         entry.topic,
    questions:     stripAnswers(entry.questions),
    questionCount: entry.questions.length,
  }));

  return res.status(200).json({
    quizSets,
    totalQuestions: quizSets.reduce((sum, s) => sum + s.questionCount, 0),
  });
};
