/**
 * Conversation history for ASK context
 */
const { admin, db } = require('./core');

async function getConversationHistory(userId) {
  const doc = await db.collection('conversations').doc(userId).get();
  if (!doc.exists) return [];
  const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
  return (doc.data().history || []).filter(t => t.timestamp > thirtyMinutesAgo);
}

async function saveConversationTurn(userId, userMsg, botMsg) {
  const now = Date.now();
  const thirtyMinutesAgo = now - 30 * 60 * 1000;
  const ref = db.collection('conversations').doc(userId);

  const doc = await ref.get();
  const existing = doc.exists
    ? (doc.data().history || []).filter(t => t.timestamp > thirtyMinutesAgo)
    : [];

  const updated = [
    ...existing,
    { role: 'user', text: userMsg, timestamp: now },
    { role: 'model', text: botMsg, timestamp: now },
  ].slice(-10);

  await ref.set({ history: updated, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
}

module.exports = { getConversationHistory, saveConversationTurn };
