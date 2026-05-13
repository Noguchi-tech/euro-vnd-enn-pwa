"use strict";

const CURRENCIES = ["EUR", "VND"];
const RATE_MODES = ["latest", "custom"];
const API_TARGET = "JPY";
const MAX_INPUT_LENGTH = 13;

const storage = window.localStorage;

const elements = {
  currencyButtons: document.querySelectorAll("[data-currency]"),
  rateModeButtons: document.querySelectorAll("[data-rate-mode]"),
  rateValue: document.getElementById("rateValue"),
  rateTimestamp: document.getElementById("rateTimestamp"),
  rateSource: document.getElementById("rateSource"),
  customRateForm: document.getElementById("customRateForm"),
  customRateInput: document.getElementById("customRateInput"),
  statusMessage: document.getElementById("statusMessage"),
  amountDisplay: document.getElementById("amountDisplay"),
  amountCurrency: document.getElementById("amountCurrency"),
  jpyResult: document.getElementById("jpyResult"),
  expressionDisplay: document.getElementById("expressionDisplay"),
  keypad: document.querySelector(".keypad"),
};

const state = {
  currentCurrency: readChoice("selectedCurrency", CURRENCIES, "EUR"),
  currentRateMode: readChoice("selectedRateMode", RATE_MODES, "latest"),
  currentRate: null,
  currentRateUpdatedAt: "",
  currentRateSource: "",
  amountInput: "",
  calculatorExpression: "",
  lastCalculatorResult: null,
  isAfterEquals: false,
  statusText: "",
  statusType: "",
};

const calc = {
  pendingValue: null,
  pendingOperator: "",
  waitingForOperand: false,
};

init();

function init() {
  bindEvents();
  registerServiceWorker();
  render();
  initializeRate();
}

function bindEvents() {
  elements.currencyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setCurrency(button.dataset.currency);
    });
  });

  elements.rateModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setRateMode(button.dataset.rateMode);
    });
  });

  elements.customRateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveCustomRate();
  });

  elements.keypad.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) {
      return;
    }

    if (button.dataset.number !== undefined) {
      appendNumber(button.dataset.number);
      return;
    }

    if (button.dataset.operator) {
      pressOperator(button.dataset.operator);
      return;
    }

    if (button.dataset.action === "equals") {
      pressEquals();
      return;
    }

    if (button.dataset.action === "clear") {
      clearCalculator();
      return;
    }

    if (button.dataset.action === "backspace") {
      backspace();
    }
  });
}

async function initializeRate() {
  if (state.currentRateMode === "latest") {
    if (navigator.onLine) {
      await fetchLatestRate();
    } else {
      applyOfflineFallback("オフラインです。保存済みレートを使用します。");
    }
    return;
  }

  applyCustomRate({ showMissingMessage: true });
}

async function setCurrency(currency) {
  if (!CURRENCIES.includes(currency)) {
    return;
  }

  state.currentCurrency = currency;
  storage.setItem("selectedCurrency", currency);
  resetStatus();
  syncCustomRateInput();
  render();

  if (state.currentRateMode === "latest") {
    await fetchLatestRate();
  } else {
    applyCustomRate({ showMissingMessage: true });
  }
}

async function setRateMode(mode) {
  if (!RATE_MODES.includes(mode)) {
    return;
  }

  state.currentRateMode = mode;
  storage.setItem("selectedRateMode", mode);
  resetStatus();
  render();

  if (mode === "latest") {
    await fetchLatestRate();
  } else {
    applyCustomRate({ showMissingMessage: true });
  }
}

async function fetchLatestRate() {
  state.statusText = "最新レートを取得しています。";
  state.statusType = "";
  render();

  try {
    const base = state.currentCurrency.toLowerCase();
    const target = API_TARGET.toLowerCase();
    const response = await fetch(`https://fxapi.app/api/${base}/${target}.json`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const rate = Number(data.rate);

    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error("invalid rate");
    }

    const updatedAt = normalizeApiTimestamp(data.timestamp);
    storage.setItem(latestRateKey(state.currentCurrency), String(rate));
    storage.setItem(latestRateUpdatedAtKey(state.currentCurrency), updatedAt);

    state.currentRate = rate;
    state.currentRateUpdatedAt = updatedAt;
    state.currentRateSource = "最新レート";
    state.statusText = "最新レートを更新しました。";
    state.statusType = "";
    render();
  } catch (error) {
    applyLatestFallback("最新レートを取得できません。保存済みレートを確認します。");
  }
}

function applyLatestFallback(message) {
  const savedLatest = readSavedRate(latestRateKey(state.currentCurrency));

  if (savedLatest !== null) {
    state.currentRate = savedLatest;
    state.currentRateUpdatedAt = storage.getItem(latestRateUpdatedAtKey(state.currentCurrency)) || "";
    state.currentRateSource = "保存済み最新レート";
    state.statusText = message;
    state.statusType = "warning";
    render();
    return;
  }

  const custom = readSavedRate(customRateKey(state.currentCurrency));
  if (custom !== null) {
    state.currentRate = custom;
    state.currentRateUpdatedAt = storage.getItem(customRateUpdatedAtKey(state.currentCurrency)) || "";
    state.currentRateSource = "設定レート";
    state.statusText = "最新レートを取得できません。設定レートを一時使用中です。";
    state.statusType = "warning";
    render();
    return;
  }

  state.currentRate = null;
  state.currentRateUpdatedAt = "";
  state.currentRateSource = "";
  state.statusText = "最新レートを取得できません。設定レートを入力してください。";
  state.statusType = "error";
  render();
}

function applyOfflineFallback(message) {
  const custom = readSavedRate(customRateKey(state.currentCurrency));
  if (custom !== null) {
    state.currentRate = custom;
    state.currentRateUpdatedAt = storage.getItem(customRateUpdatedAtKey(state.currentCurrency)) || "";
    state.currentRateSource = "設定レート";
    state.statusText = message;
    state.statusType = "warning";
    render();
    return;
  }

  const savedLatest = readSavedRate(latestRateKey(state.currentCurrency));
  if (savedLatest !== null) {
    state.currentRate = savedLatest;
    state.currentRateUpdatedAt = storage.getItem(latestRateUpdatedAtKey(state.currentCurrency)) || "";
    state.currentRateSource = "保存済み最新レート";
    state.statusText = message;
    state.statusType = "warning";
    render();
    return;
  }

  state.currentRate = null;
  state.currentRateUpdatedAt = "";
  state.currentRateSource = "";
  state.statusText = "オフラインです。設定レートを入力してください。";
  state.statusType = "error";
  render();
}

function applyCustomRate({ showMissingMessage }) {
  const custom = readSavedRate(customRateKey(state.currentCurrency));
  if (custom === null) {
    state.currentRate = null;
    state.currentRateUpdatedAt = "";
    state.currentRateSource = "";
    if (showMissingMessage) {
      state.statusText = "設定レートを入力してください。";
      state.statusType = "warning";
    }
    render();
    return;
  }

  state.currentRate = custom;
  state.currentRateUpdatedAt = storage.getItem(customRateUpdatedAtKey(state.currentCurrency)) || "";
  state.currentRateSource = "設定レート";
  if (showMissingMessage) {
    state.statusText = "設定レートを使用中です。";
    state.statusType = "";
  }
  render();
}

function saveCustomRate() {
  const rate = Number(elements.customRateInput.value);
  if (!Number.isFinite(rate) || rate <= 0) {
    state.statusText = "設定レートは0より大きい数値で入力してください。";
    state.statusType = "error";
    render();
    return;
  }

  const updatedAt = new Date().toISOString();
  storage.setItem(customRateKey(state.currentCurrency), String(rate));
  storage.setItem(customRateUpdatedAtKey(state.currentCurrency), updatedAt);
  state.currentRateMode = "custom";
  storage.setItem("selectedRateMode", "custom");
  state.currentRate = rate;
  state.currentRateUpdatedAt = updatedAt;
  state.currentRateSource = "設定レート";
  state.statusText = "設定レートを保存しました。";
  state.statusType = "";
  render();
}

function appendNumber(value) {
  if (state.isAfterEquals && !calc.waitingForOperand) {
    resetCalculationOnly();
  }

  if (calc.waitingForOperand) {
    state.amountInput = "";
    calc.waitingForOperand = false;
  }

  if (value === ".") {
    appendDecimalPoint();
  } else {
    appendDigit(value);
  }

  updateExpressionForEntry();
  resetStatusIfCalculatorMessage();
  render();
}

function appendDigit(value) {
  if (state.amountInput.replace("-", "").replace(".", "").length >= MAX_INPUT_LENGTH) {
    return;
  }

  if (state.amountInput === "0") {
    state.amountInput = value;
    return;
  }

  if (state.amountInput === "-0") {
    state.amountInput = `-${value}`;
    return;
  }

  state.amountInput += value;
}

function appendDecimalPoint() {
  if (state.amountInput.includes(".")) {
    return;
  }

  state.amountInput = state.amountInput ? `${state.amountInput}.` : "0.";
}

function pressOperator(operator) {
  resetStatusIfCalculatorMessage();

  if (state.isAfterEquals) {
    const base = state.lastCalculatorResult ?? parseAmount(state.amountInput) ?? 0;
    calc.pendingValue = base;
    calc.pendingOperator = operator;
    calc.waitingForOperand = true;
    state.amountInput = formatRawNumber(base);
    state.calculatorExpression = `${formatExpressionNumber(base)} ${operator}`;
    state.isAfterEquals = false;
    render();
    return;
  }

  if (calc.pendingOperator && calc.waitingForOperand) {
    calc.pendingOperator = operator;
    state.calculatorExpression = `${formatExpressionNumber(calc.pendingValue)} ${operator}`;
    render();
    return;
  }

  const value = parseAmount(state.amountInput);
  if (value === null) {
    return;
  }

  if (calc.pendingOperator) {
    const result = calculate(calc.pendingValue, value, calc.pendingOperator);
    if (result === null) {
      showCalculatorError("0で割ることはできません。");
      return;
    }

    calc.pendingValue = result;
    calc.pendingOperator = operator;
    calc.waitingForOperand = true;
    state.amountInput = formatRawNumber(result);
    state.lastCalculatorResult = result;
    state.calculatorExpression = `${formatExpressionNumber(result)} ${operator}`;
    render();
    return;
  }

  calc.pendingValue = value;
  calc.pendingOperator = operator;
  calc.waitingForOperand = true;
  state.calculatorExpression = `${formatExpressionNumber(value)} ${operator}`;
  render();
}

function pressEquals() {
  resetStatusIfCalculatorMessage();

  if (!calc.pendingOperator || calc.waitingForOperand) {
    return;
  }

  const rightValue = parseAmount(state.amountInput);
  if (rightValue === null) {
    return;
  }

  const leftValue = calc.pendingValue;
  const operator = calc.pendingOperator;
  const result = calculate(leftValue, rightValue, operator);

  if (result === null) {
    showCalculatorError("0で割ることはできません。");
    return;
  }

  state.lastCalculatorResult = result;
  state.amountInput = formatRawNumber(result);
  state.calculatorExpression = `${formatExpressionNumber(leftValue)} ${operator} ${formatExpressionNumber(rightValue)} = ${formatExpressionNumber(result)}`;
  state.isAfterEquals = true;
  calc.pendingValue = null;
  calc.pendingOperator = "";
  calc.waitingForOperand = false;
  render();
}

function clearCalculator() {
  state.amountInput = "";
  state.calculatorExpression = "";
  state.lastCalculatorResult = null;
  state.isAfterEquals = false;
  calc.pendingValue = null;
  calc.pendingOperator = "";
  calc.waitingForOperand = false;
  resetStatusIfCalculatorMessage();
  render();
}

function backspace() {
  if (state.isAfterEquals) {
    resetCalculationOnly();
  }

  if (calc.waitingForOperand) {
    calc.pendingOperator = "";
    calc.waitingForOperand = false;
    state.calculatorExpression = state.amountInput ? formatExpressionNumber(parseAmount(state.amountInput)) : "";
    render();
    return;
  }

  state.amountInput = state.amountInput.slice(0, -1);
  updateExpressionForEntry();
  resetStatusIfCalculatorMessage();
  render();
}

function calculate(left, right, operator) {
  if (operator === "+") {
    return normalizeResult(left + right);
  }
  if (operator === "-") {
    return normalizeResult(left - right);
  }
  if (operator === "×") {
    return normalizeResult(left * right);
  }
  if (operator === "÷") {
    if (right === 0) {
      return null;
    }
    return normalizeResult(left / right);
  }
  return right;
}

function updateExpressionForEntry() {
  if (calc.pendingOperator) {
    const left = formatExpressionNumber(calc.pendingValue);
    const right = state.amountInput ? formatExpressionNumber(parseAmount(state.amountInput)) : "";
    state.calculatorExpression = right ? `${left} ${calc.pendingOperator} ${right}` : `${left} ${calc.pendingOperator}`;
    return;
  }

  state.calculatorExpression = state.amountInput;
}

function resetCalculationOnly() {
  state.amountInput = "";
  state.calculatorExpression = "";
  state.lastCalculatorResult = null;
  state.isAfterEquals = false;
  calc.pendingValue = null;
  calc.pendingOperator = "";
  calc.waitingForOperand = false;
}

function showCalculatorError(message) {
  state.statusText = message;
  state.statusType = "error";
  render();
}

function resetStatusIfCalculatorMessage() {
  if (state.statusText === "0で割ることはできません。") {
    resetStatus();
  }
}

function resetStatus() {
  state.statusText = "";
  state.statusType = "";
}

function render() {
  elements.currencyButtons.forEach((button) => {
    const isActive = button.dataset.currency === state.currentCurrency;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  elements.rateModeButtons.forEach((button) => {
    const isActive = button.dataset.rateMode === state.currentRateMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  elements.customRateForm.hidden = state.currentRateMode !== "custom";
  syncCustomRateInput();

  elements.rateValue.textContent = state.currentRate
    ? `1 ${state.currentCurrency} = ${formatRate(state.currentRate)} 円`
    : "レート未設定";
  elements.rateTimestamp.textContent = state.currentRateUpdatedAt
    ? formatDateTime(state.currentRateUpdatedAt)
    : "更新日時なし";
  elements.rateSource.textContent = state.currentRateSource || "-";

  elements.statusMessage.textContent = state.statusText;
  elements.statusMessage.classList.toggle("is-error", state.statusType === "error");
  elements.statusMessage.classList.toggle("is-warning", state.statusType === "warning");

  elements.amountCurrency.textContent = state.currentCurrency;
  elements.amountDisplay.textContent = formatAmountDisplay(state.amountInput);
  elements.jpyResult.textContent = buildJpyResult();
  elements.expressionDisplay.textContent = state.calculatorExpression || formatAmountDisplay(state.amountInput);
}

function syncCustomRateInput() {
  const saved = storage.getItem(customRateKey(state.currentCurrency)) || "";
  if (document.activeElement !== elements.customRateInput) {
    elements.customRateInput.value = saved;
  }
}

function buildJpyResult() {
  if (!state.currentRate) {
    return "レート未設定";
  }

  const amount = parseAmount(state.amountInput) || 0;
  const jpy = Math.round(amount * state.currentRate);
  return `約 ${formatInteger(jpy)} 円`;
}

function readChoice(key, choices, fallback) {
  const value = storage.getItem(key);
  return choices.includes(value) ? value : fallback;
}

function readSavedRate(key) {
  const value = Number(storage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseAmount(value) {
  if (!value || value === "-" || value === "." || value === "-.") {
    return null;
  }

  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function normalizeResult(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(Number(value).toPrecision(12));
}

function formatRawNumber(value) {
  if (!Number.isFinite(value)) {
    return "";
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return String(Number(value.toFixed(8))).replace(/\.?0+$/, "");
}

function formatExpressionNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "";
  }
  return formatAmountDisplay(formatRawNumber(value));
}

function formatAmountDisplay(value) {
  if (!value) {
    return "0";
  }

  const sign = value.startsWith("-") ? "-" : "";
  const unsigned = sign ? value.slice(1) : value;
  const [integerPart, decimalPart] = unsigned.split(".");
  const safeInteger = integerPart || "0";
  const formattedInteger = safeInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  if (value.endsWith(".")) {
    return `${sign}${formattedInteger}.`;
  }

  return decimalPart !== undefined
    ? `${sign}${formattedInteger}.${decimalPart}`
    : `${sign}${formattedInteger}`;
}

function formatInteger(value) {
  return new Intl.NumberFormat("ja-JP").format(value);
}

function formatRate(rate) {
  if (rate >= 1) {
    return new Intl.NumberFormat("ja-JP", {
      maximumFractionDigits: 3,
    }).format(rate);
  }

  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
  }).format(rate);
}

function normalizeApiTimestamp(timestamp) {
  const normalizedTimestamp =
    typeof timestamp === "number" && timestamp < 1000000000000 ? timestamp * 1000 : timestamp;
  const date = normalizedTimestamp ? new Date(normalizedTimestamp) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "更新日時なし";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function latestRateKey(currency) {
  return `latestRate_${currency}`;
}

function latestRateUpdatedAtKey(currency) {
  return `latestRateUpdatedAt_${currency}`;
}

function customRateKey(currency) {
  return `customRate_${currency}`;
}

function customRateUpdatedAtKey(currency) {
  return `customRateUpdatedAt_${currency}`;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      state.statusText = "オフライン起動の準備に失敗しました。";
      state.statusType = "warning";
      render();
    });
  });
}
