/**
 * QuizEngine — Requirement 2 core component
 *
 * Serves educational quiz questions for each campus sustainability location.
 * Backed by a JSON "database" (quiz.json) and an in-memory adjacency-list
 * graph that enables BFS-based topic discovery.
 *
 * Data structures used
 *  _db          Map<locationId, Question[]>  — O(1) question lookup per location
 *  _topicGraph  Map<topic, topic[]>          — adjacency list for BFS
 *  _answered    Map<locationId, Set<number>> — O(1) per-question answered check
 *  _scores      Map<locationId, {correct,total}> — O(1) score retrieval
 *
 * Algorithm: BFS topic traversal
 *  Starting from a seed topic (e.g. "solar-energy"), BFS explores the topic
 *  graph layer by layer and returns related topics in order of conceptual
 *  distance. This surfaces learning connections: a user at the solar panel
 *  learns that solar → renewable-energy → ev-charging → clean-air.
 *
 *  BFS chosen over DFS because BFS naturally produces results in breadth-first
 *  order (closest relationships first), which matches the UX goal of showing
 *  the most directly related topics before distant ones.
 *
 * Big-O summary (V = topics, E = edges, q = questions per location)
 *  getQuestions(id)        → O(1) — Map lookup
 *  checkAnswer(...)        → O(1) — Map + Set operations
 *  getScore(id)            → O(1)
 *  getRelatedTopics(topic) → O(V + E) — standard BFS
 *  _buildTopicGraph(data)  → O(V + E) — one-time construction at init
 */
export class QuizEngine {
  /**
   * @param {Array<{locationId:string, questions:Question[], topic:string}>} quizData
   *   Parsed contents of quiz.json
   * @param {Array<[string,string]>} topicEdges
   *   Edge list from topics.json — keeps graph data in the data layer, not here
   */
  constructor(quizData = [], topicEdges = []) {
    this._topicEdges = topicEdges;
    // Primary lookup: locationId → questions array
    this._db = new Map();

    // Score tracking: locationId → { correct: number, total: number }
    this._scores = new Map();

    // Answered set: locationId → Set<questionIndex>
    this._answered = new Map();

    for (const entry of quizData) {
      this._db.set(entry.locationId, entry.questions);
      this._scores.set(entry.locationId, { correct: 0, total: 0 });
      this._answered.set(entry.locationId, new Set());
    }

    // Build topic graph once at construction time using external edge list
    this._topicGraph = this._buildTopicGraph(quizData, topicEdges);
  }

  // ── Question access ───────────────────────────────────────────────────────

  /**
   * Return all questions for a location. O(1) Map lookup.
   * @param {string} locationId
   * @returns {Question[]}
   */
  getQuestions(locationId) {
    return this._db.get(locationId) ?? [];
  }

  /**
   * Return a single question by index. O(1).
   * @param {string} locationId
   * @param {number} index
   * @returns {Question|null}
   */
  getQuestion(locationId, index) {
    return this._db.get(locationId)?.[index] ?? null;
  }

  /**
   * How many questions does this location have? O(1).
   */
  questionCount(locationId) {
    return (this._db.get(locationId) ?? []).length;
  }

  // ── Answer checking ───────────────────────────────────────────────────────

  /**
   * Check an answer and update the score. O(1).
   *
   * @param {string} locationId
   * @param {number} questionIndex   — 0-based
   * @param {number} chosenOption    — 0-based index into question.options
   * @returns {{ correct: boolean, correctIndex: number, explanation: string }}
   */
  checkAnswer(locationId, questionIndex, chosenOption) {
    const question = this.getQuestion(locationId, questionIndex);
    if (!question) return { correct: false, correctIndex: -1, explanation: '' };

    const correct = chosenOption === question.answer;
    const answered = this._answered.get(locationId);

    // Only count first attempt per question
    if (!answered.has(questionIndex)) {
      answered.add(questionIndex);
      const score = this._scores.get(locationId);
      score.total += 1;
      if (correct) score.correct += 1;
    }

    return {
      correct,
      correctIndex: question.answer,
      explanation: question.explanation ?? '',
    };
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  /**
   * Current score for a location. O(1).
   * @returns {{ correct: number, total: number, percent: number }}
   */
  getScore(locationId) {
    const s = this._scores.get(locationId) ?? { correct: 0, total: 0 };
    return { ...s, percent: s.total === 0 ? 0 : Math.round((s.correct / s.total) * 100) };
  }

  /**
   * Aggregate score across all locations. O(n) where n = location count.
   */
  getTotalScore() {
    let correct = 0, total = 0;
    for (const s of this._scores.values()) {
      correct += s.correct;
      total   += s.total;
    }
    return { correct, total, percent: total === 0 ? 0 : Math.round((correct / total) * 100) };
  }

  // ── BFS topic graph ───────────────────────────────────────────────────────

  /**
   * BFS traversal of the topic graph starting at seedTopic.
   * Returns topics in order of conceptual distance (breadth-first).
   *
   * Example: getRelatedTopics('solar-energy', 2)
   *   depth 0 → ['solar-energy']
   *   depth 1 → ['renewable-energy', 'carbon-offset']
   *   depth 2 → ['ev-charging', 'climate-change', 'greenhouse-gas']
   *
   * @param {string}  seedTopic
   * @param {number}  maxDepth  — how many hops to explore (default 2)
   * @returns {Array<{ topic: string, depth: number }>}
   */
  getRelatedTopics(seedTopic, maxDepth = 2) {
    const visited = new Set();
    const result  = [];
    // BFS queue stores { topic, depth } pairs
    const queue   = [{ topic: seedTopic, depth: 0 }];

    while (queue.length > 0) {
      const { topic, depth } = queue.shift();  // dequeue front — O(1) amortised

      if (visited.has(topic) || depth > maxDepth) continue;
      visited.add(topic);
      result.push({ topic, depth });

      // Enqueue all unvisited neighbours at depth+1
      const neighbours = this._topicGraph.get(topic) ?? [];
      for (const neighbour of neighbours) {
        if (!visited.has(neighbour)) {
          queue.push({ topic: neighbour, depth: depth + 1 });
        }
      }
    }

    return result;
  }

  /**
   * Look up which location covers a given topic. O(n).
   * Useful for deep-linking from "Related Topics" UI back to a POI.
   * @param {string} topic
   * @returns {string|null} locationId
   */
  getLocationForTopic(topic) {
    for (const [locationId, questions] of this._db.entries()) {
      if (questions.some(q => q.topic === topic)) return locationId;
    }
    return null;
  }

  // ── Graph construction (private) ──────────────────────────────────────────

  /**
   * Build the topic adjacency list from the quiz data plus a hard-coded
   * campus sustainability knowledge graph.
   *
   * The graph is an undirected (bidirectional) Map<topic, topic[]>.
   * Construction is O(V + E).
   */
  _buildTopicGraph(quizData, topicEdges = []) {
    const graph = new Map();

    const addEdge = (a, b) => {
      if (!graph.has(a)) graph.set(a, []);
      if (!graph.has(b)) graph.set(b, []);
      if (!graph.get(a).includes(b)) graph.get(a).push(b);
      if (!graph.get(b).includes(a)) graph.get(b).push(a);
    };

    // Load edges from the data layer (topics.json) instead of hardcoding them
    for (const [a, b] of topicEdges) addEdge(a, b);

    // Also link topics extracted from the quiz data itself
    for (const entry of quizData) {
      const topics = [...new Set(entry.questions.map(q => q.topic).filter(Boolean))];
      for (let i = 0; i < topics.length - 1; i++) {
        addEdge(topics[i], topics[i + 1]);
      }
    }

    return graph;
  }
}

/**
 * @typedef {{ q: string, options: string[], answer: number, topic: string, explanation?: string }} Question
 */
