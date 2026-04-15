export type SubjectCadence = "daily" | "weekly";
export type SubjectCardSize = 3 | 4;

export type ThemePalette = {
  bg?: string;
  bgAccent?: string;
  panel?: string;
  panelStrong?: string;
  text?: string;
  muted?: string;
  primary?: string;
  primaryStrong?: string;
  accent?: string;
  border?: string;
  shadow?: string;
  selectedBorder?: string;
  selectedTop?: string;
  selectedBottom?: string;
  winningBorder?: string;
  winningTop?: string;
  winningBottom?: string;
};

export type SubjectTheme = {
  light?: ThemePalette;
  dark?: ThemePalette;
};

export type SubjectConfig = {
  title: string;
  subtitle?: string;
  cadence: SubjectCadence;
  cardSize: SubjectCardSize;
  entries: string[];
  theme?: SubjectTheme;
};

export function validateSubjectConfig(
  config: unknown,
  context = "Subject config",
): asserts config is SubjectConfig {
  if (!isRecord(config)) {
    throw new Error(`${context} must be a JSON object.`);
  }

  if (typeof config.title !== "string" || config.title.trim().length === 0) {
    throw new Error(`${context} needs a non-empty "title".`);
  }

  if (
    typeof config.subtitle !== "undefined" &&
    typeof config.subtitle !== "string"
  ) {
    throw new Error(`${context} subtitle must be a string when provided.`);
  }

  if (config.cadence !== "daily" && config.cadence !== "weekly") {
    throw new Error(`${context} cadence must be "daily" or "weekly".`);
  }

  if (config.cardSize !== 3 && config.cardSize !== 4) {
    throw new Error(`${context} cardSize must be 3 or 4.`);
  }

  if (!Array.isArray(config.entries)) {
    throw new Error(`${context} entries must be an array.`);
  }

  const requiredEntries = config.cardSize * config.cardSize;

  if (config.entries.length < requiredEntries) {
    throw new Error(
      `${context} needs at least ${requiredEntries} entries for a ${config.cardSize}x${config.cardSize} board.`,
    );
  }

  const hasInvalidEntry = config.entries.some((entry) => {
    return typeof entry !== "string" || entry.trim().length === 0;
  });

  if (hasInvalidEntry) {
    throw new Error(`${context} contains empty or invalid entries.`);
  }

  if (typeof config.theme !== "undefined") {
    validateTheme(config.theme, `${context} theme`);
  }
}

function validateTheme(theme: unknown, context: string): void {
  if (!isRecord(theme)) {
    throw new Error(`${context} must be an object when provided.`);
  }

  validatePalette(theme.light, `${context}.light`);
  validatePalette(theme.dark, `${context}.dark`);
}

function validatePalette(palette: unknown, context: string): void {
  if (typeof palette === "undefined") {
    return;
  }

  if (!isRecord(palette)) {
    throw new Error(`${context} must be an object when provided.`);
  }

  for (const [key, value] of Object.entries(palette)) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`${context}.${key} must be a non-empty string.`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
