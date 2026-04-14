import bingoConfig from "../src/bingo-fields.json";

const { cardSize, entries } = bingoConfig;
const expectedEntries = cardSize * cardSize;

if (!Number.isInteger(cardSize) || cardSize <= 0) {
  throw new Error("`cardSize` must be a positive integer.");
}

if (!Array.isArray(entries)) {
  throw new Error("`entries` must be an array.");
}

if (entries.length < expectedEntries) {
  throw new Error(
    `Need at least ${expectedEntries} bingo entries for a ${cardSize}x${cardSize} card.`,
  );
}

const emptyEntries = entries.filter(
  (entry) => typeof entry !== "string" || entry.trim().length === 0,
);

if (emptyEntries.length > 0) {
  throw new Error("All bingo entries must be non-empty strings.");
}

console.log(
  `Validated ${entries.length} bingo entries for a ${cardSize}x${cardSize} card.`,
);
