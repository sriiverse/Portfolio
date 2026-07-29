/**
 * corpus.js — Load a document corpus for retrieval channels.
 *
 * Defaults to the modular knowledge layer. Inject `loadCorpus` to swap stores.
 */

/**
 * @returns {Promise<object[]>}
 */
export async function loadDefaultCorpus(opts = {}) {
  const {
    bootstrapKnowledgeSources,
    loadAll,
    loadCategory,
  } = await import('../knowledge/knowledgeLoader.js');

  await bootstrapKnowledgeSources();

  const categories = opts.categories;
  if (Array.isArray(categories) && categories.length) {
    const batches = await Promise.all(
      categories.map((c) => loadCategory(c, { validate: opts.validate !== false })),
    );
    return batches.flat().map(stampSource);
  }

  const docs = await loadAll({ validate: opts.validate !== false });
  return docs.map(stampSource);
}

function stampSource(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  if (!doc._sourceId) {
    doc._sourceId = doc.metadata?.sourceId || doc.category || 'unknown';
  }
  return doc;
}

export default { loadDefaultCorpus };
