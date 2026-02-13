/*
 * rule-builder-window.js - Visual rule builder for composing breakpoint conditions
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";

export class RuleBuilderWindow extends BaseWindow {
  constructor() {
    super({
      id: "rule-builder",
      title: "Condition Rule Builder",
      minWidth: 420,
      minHeight: 300,
      defaultWidth: 540,
      defaultHeight: 440,
    });

    this.rules = null; // Root group node
    this.targetAddress = null;
    this.targetMode = "cpu"; // "cpu" or "basic"
    this.onApply = null; // Callback: (address, conditionString, conditionRules) => {}
    this.onApplyBasic = null; // Callback: (key, conditionString, conditionRules) => {}
  }

  renderContent() {
    return `
      <div class="rb-root">
        <div class="rb-header-bar">
          <span class="rb-target-label" id="rb-target-label">Condition</span>
        </div>
        <div class="rb-rules-container" id="rb-rules-container"></div>
        <div class="rb-preview" id="rb-preview"></div>
        <div class="rb-actions">
          <button class="rb-btn rb-btn-clear" id="rb-clear">Clear</button>
          <div class="rb-actions-right">
            <button class="rb-btn rb-btn-cancel" id="rb-cancel">Cancel</button>
            <button class="rb-btn rb-btn-apply" id="rb-apply">Apply</button>
          </div>
        </div>
      </div>
    `;
  }

  setupContentEventListeners() {
    this.contentElement.querySelector("#rb-clear")
      .addEventListener("click", () => this.handleClear());
    this.contentElement.querySelector("#rb-cancel")
      .addEventListener("click", () => this.handleCancel());
    this.contentElement.querySelector("#rb-apply")
      .addEventListener("click", () => this.handleApply());
  }

  create() {
    super.create();
    this.setupContentEventListeners();
  }

  /**
   * Open the rule builder for a CPU breakpoint.
   */
  editBreakpoint(address, entry) {
    this.targetAddress = address;
    this.targetMode = "cpu";

    const label = this.contentElement.querySelector("#rb-target-label");
    if (label) {
      label.textContent = `Condition for $${this.formatHex(address, 4)}`;
    }

    if (entry && entry.conditionRules) {
      this.rules = JSON.parse(JSON.stringify(entry.conditionRules));
    } else {
      this.rules = this._createEmptyGroup();
    }

    this.renderRuleTree();
    this.updatePreview();
    this.show();
  }

  /**
   * Open the rule builder for a BASIC breakpoint.
   * @param {string} key - "lineNumber:statementIndex" key
   * @param {object} entry - breakpoint entry with condition/conditionRules
   * @param {string} labelText - display label like "Line 100"
   */
  editBasicBreakpoint(key, entry, labelText) {
    this.targetAddress = key;
    this.targetMode = "basic";

    const label = this.contentElement.querySelector("#rb-target-label");
    if (label) {
      label.textContent = `Condition for ${labelText}`;
    }

    if (entry && entry.conditionRules) {
      this.rules = JSON.parse(JSON.stringify(entry.conditionRules));
    } else {
      this.rules = this._createEmptyGroup();
    }

    this.renderRuleTree();
    this.updatePreview();
    this.show();
  }

  // ---- Data model helpers ----

  _createEmptyGroup() {
    return { type: "group", logic: "AND", children: [] };
  }

  _createDefaultRule() {
    if (this.targetMode === "basic") {
      return { type: "rule", subject: "bvar", detail: "", operator: "==", value: "" };
    }
    return { type: "rule", subject: "reg", detail: "A", operator: "==", value: "" };
  }

  // ---- Rendering ----

  renderRuleTree() {
    const container = this.contentElement.querySelector("#rb-rules-container");
    if (!container) return;
    container.innerHTML = "";
    container.appendChild(this.renderGroup(this.rules, 0, null));
  }

  renderGroup(group, depth, parent) {
    const div = document.createElement("div");
    div.className = "rb-group";
    div.dataset.depth = depth;

    const accentColors = ["#18ABEA", "#B55DB6", "#F68D35", "#6EC94F", "#E5504F", "#FDBE34"];
    div.style.borderLeftColor = accentColors[depth % accentColors.length];

    // Group header
    const header = document.createElement("div");
    header.className = "rb-group-header";

    const matchLabel = document.createElement("span");
    matchLabel.className = "rb-match-label";
    matchLabel.textContent = "Match";

    const logicSelect = document.createElement("select");
    logicSelect.className = "rb-logic-select";
    logicSelect.innerHTML = `
      <option value="AND" ${group.logic === "AND" ? "selected" : ""}>ALL</option>
      <option value="OR" ${group.logic === "OR" ? "selected" : ""}>ANY</option>
    `;
    logicSelect.addEventListener("change", () => {
      group.logic = logicSelect.value;
      this.renderRuleTree();
      this.updatePreview();
    });

    const ofLabel = document.createElement("span");
    ofLabel.className = "rb-match-label";
    ofLabel.textContent = "of the following";

    header.appendChild(matchLabel);
    header.appendChild(logicSelect);
    header.appendChild(ofLabel);

    // Remove button for non-root groups
    if (parent) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "rb-group-remove";
      removeBtn.title = "Remove group";
      removeBtn.textContent = "\u00d7";
      removeBtn.addEventListener("click", () => {
        const idx = parent.children.indexOf(group);
        if (idx >= 0) {
          parent.children.splice(idx, 1);
          this.renderRuleTree();
          this.updatePreview();
        }
      });
      header.appendChild(removeBtn);
    }

    div.appendChild(header);

    // Children
    const childrenContainer = document.createElement("div");
    childrenContainer.className = "rb-group-children";

    for (let i = 0; i < group.children.length; i++) {
      const child = group.children[i];

      // Connector label between siblings
      if (i > 0) {
        const connector = document.createElement("div");
        connector.className = "rb-connector";
        connector.textContent = group.logic === "AND" ? "\u2500\u2500 AND \u2500\u2500" : "\u2500\u2500 OR \u2500\u2500";
        childrenContainer.appendChild(connector);
      }

      if (child.type === "group") {
        childrenContainer.appendChild(this.renderGroup(child, depth + 1, group));
      } else {
        childrenContainer.appendChild(this.renderRuleRow(child, i, group));
      }
    }

    div.appendChild(childrenContainer);

    // Add buttons
    const addBtns = document.createElement("div");
    addBtns.className = "rb-add-btns";

    const addRuleBtn = document.createElement("button");
    addRuleBtn.className = "rb-btn rb-btn-add";
    addRuleBtn.textContent = "+ Rule";
    addRuleBtn.addEventListener("click", () => {
      group.children.push(this._createDefaultRule());
      this.renderRuleTree();
      this.updatePreview();
    });

    const addGroupBtn = document.createElement("button");
    addGroupBtn.className = "rb-btn rb-btn-add";
    addGroupBtn.textContent = "+ Group";
    addGroupBtn.addEventListener("click", () => {
      group.children.push(this._createEmptyGroup());
      this.renderRuleTree();
      this.updatePreview();
    });

    addBtns.appendChild(addRuleBtn);
    addBtns.appendChild(addGroupBtn);
    div.appendChild(addBtns);

    return div;
  }

  renderRuleRow(rule, index, parentGroup) {
    const row = document.createElement("div");
    row.className = "rb-rule-row";

    // Subject select
    const subjectSelect = document.createElement("select");
    subjectSelect.className = "rb-select rb-subject";
    if (this.targetMode === "basic") {
      subjectSelect.innerHTML = `
        <option value="bvar" ${rule.subject === "bvar" ? "selected" : ""}>BASIC Var</option>
        <option value="barr" ${rule.subject === "barr" ? "selected" : ""}>BASIC Array</option>
      `;
    } else {
      subjectSelect.innerHTML = `
        <option value="reg" ${rule.subject === "reg" ? "selected" : ""}>Register</option>
        <option value="flag" ${rule.subject === "flag" ? "selected" : ""}>Flag</option>
        <option value="byte" ${rule.subject === "byte" ? "selected" : ""}>Byte</option>
        <option value="word" ${rule.subject === "word" ? "selected" : ""}>Word</option>
      `;
    }
    subjectSelect.addEventListener("change", () => {
      rule.subject = subjectSelect.value;
      // Reset detail to sensible default
      if (rule.subject === "reg") rule.detail = "A";
      else if (rule.subject === "flag") rule.detail = "C";
      else if (rule.subject === "bvar") { rule.detail = ""; rule.varIndex = undefined; }
      else if (rule.subject === "barr") { rule.detail = ""; rule.varIndex = "0"; rule.varIndex2 = ""; }
      else rule.detail = "";
      this.renderRuleTree();
      this.updatePreview();
    });

    // Detail control (adaptive based on subject)
    const detailEl = this._createDetailControl(rule);

    // Operator select
    const opSelect = document.createElement("select");
    opSelect.className = "rb-select rb-operator";
    const operators = ["==", "!=", "<", ">", "<=", ">="];
    for (const op of operators) {
      const opt = document.createElement("option");
      opt.value = op;
      opt.textContent = op;
      if (rule.operator === op) opt.selected = true;
      opSelect.appendChild(opt);
    }
    opSelect.addEventListener("change", () => {
      rule.operator = opSelect.value;
      this.updatePreview();
    });

    // Value input
    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.className = "rb-input rb-value";
    valueInput.value = rule.value;
    valueInput.placeholder = rule.subject === "flag" ? "0 or 1" : "$FF";
    valueInput.spellcheck = false;
    valueInput.addEventListener("input", () => {
      rule.value = valueInput.value.trim();
      this.updatePreview();
    });
    valueInput.addEventListener("keydown", (e) => e.stopPropagation());

    // Remove button
    const removeBtn = document.createElement("button");
    removeBtn.className = "rb-rule-remove";
    removeBtn.title = "Remove rule";
    removeBtn.textContent = "\u00d7";
    removeBtn.addEventListener("click", () => {
      const idx = parentGroup.children.indexOf(rule);
      if (idx >= 0) {
        parentGroup.children.splice(idx, 1);
        this.renderRuleTree();
        this.updatePreview();
      }
    });

    row.appendChild(subjectSelect);
    row.appendChild(detailEl);
    row.appendChild(opSelect);
    row.appendChild(valueInput);
    row.appendChild(removeBtn);

    return row;
  }

  _createDetailControl(rule) {
    if (rule.subject === "reg") {
      const sel = document.createElement("select");
      sel.className = "rb-select rb-detail";
      const regs = ["A", "X", "Y", "SP", "PC", "P"];
      for (const r of regs) {
        const opt = document.createElement("option");
        opt.value = r;
        opt.textContent = r;
        if (rule.detail === r) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener("change", () => {
        rule.detail = sel.value;
        this.updatePreview();
      });
      return sel;
    }

    if (rule.subject === "flag") {
      const sel = document.createElement("select");
      sel.className = "rb-select rb-detail";
      const flags = ["N", "V", "B", "D", "I", "Z", "C"];
      for (const f of flags) {
        const opt = document.createElement("option");
        opt.value = f;
        opt.textContent = f;
        if (rule.detail === f) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener("change", () => {
        rule.detail = sel.value;
        this.updatePreview();
      });
      return sel;
    }

    // BASIC variable name input
    if (rule.subject === "bvar") {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "rb-input rb-detail";
      input.value = rule.detail;
      input.placeholder = "e.g. I, SC%, A$";
      input.spellcheck = false;
      input.addEventListener("input", () => {
        rule.detail = input.value.trim().toUpperCase();
        this.updatePreview();
      });
      input.addEventListener("keydown", (e) => e.stopPropagation());
      return input;
    }

    // BASIC array - name + index1 + optional index2
    if (rule.subject === "barr") {
      const container = document.createElement("span");
      container.className = "rb-detail-group";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "rb-input rb-detail rb-detail-third";
      nameInput.value = rule.detail;
      nameInput.placeholder = "Name";
      nameInput.spellcheck = false;
      nameInput.addEventListener("input", () => {
        rule.detail = nameInput.value.trim().toUpperCase();
        this.updatePreview();
      });
      nameInput.addEventListener("keydown", (e) => e.stopPropagation());

      const idx1Input = document.createElement("input");
      idx1Input.type = "text";
      idx1Input.className = "rb-input rb-detail rb-detail-third";
      idx1Input.value = rule.varIndex || "0";
      idx1Input.placeholder = "i1";
      idx1Input.spellcheck = false;
      idx1Input.addEventListener("input", () => {
        rule.varIndex = idx1Input.value.trim();
        this.updatePreview();
      });
      idx1Input.addEventListener("keydown", (e) => e.stopPropagation());

      const idx2Input = document.createElement("input");
      idx2Input.type = "text";
      idx2Input.className = "rb-input rb-detail rb-detail-third";
      idx2Input.value = rule.varIndex2 || "";
      idx2Input.placeholder = "i2";
      idx2Input.spellcheck = false;
      idx2Input.addEventListener("input", () => {
        rule.varIndex2 = idx2Input.value.trim();
        this.updatePreview();
      });
      idx2Input.addEventListener("keydown", (e) => e.stopPropagation());

      container.appendChild(nameInput);
      container.appendChild(idx1Input);
      container.appendChild(idx2Input);
      return container;
    }

    // byte or word - address input
    const input = document.createElement("input");
    input.type = "text";
    input.className = "rb-input rb-detail";
    input.value = rule.detail;
    input.placeholder = "$0000";
    input.spellcheck = false;
    input.addEventListener("input", () => {
      rule.detail = input.value.trim();
      this.updatePreview();
    });
    input.addEventListener("keydown", (e) => e.stopPropagation());
    return input;
  }

  // ---- Serialization ----

  serializeToExpression(node) {
    if (!node) return "";

    if (node.type === "rule") {
      return this._serializeRule(node);
    }

    // Group
    const parts = node.children
      .map((child) => this.serializeToExpression(child))
      .filter((s) => s.length > 0);

    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0];

    const joiner = node.logic === "AND" ? " && " : " || ";
    return "(" + parts.map((p) => `(${p})`).join(joiner) + ")";
  }

  _serializeRule(rule) {
    let lhs;
    switch (rule.subject) {
      case "reg":
        lhs = rule.detail || "A";
        break;
      case "flag":
        lhs = rule.detail || "C";
        break;
      case "byte": {
        const addr = this._normalizeAddress(rule.detail);
        lhs = `PEEK(${addr})`;
        break;
      }
      case "word": {
        const addr = this._normalizeAddress(rule.detail);
        lhs = `DEEK(${addr})`;
        break;
      }
      case "bvar": {
        const { b1, b2 } = this._encodeBasicVarName(rule.detail || "A");
        lhs = `BV(${b1},${b2})`;
        break;
      }
      case "barr": {
        const { b1, b2 } = this._encodeBasicVarName(rule.detail || "A");
        const idx1 = parseInt(rule.varIndex) || 0;
        if (rule.varIndex2 !== undefined && rule.varIndex2 !== "") {
          const idx2 = parseInt(rule.varIndex2) || 0;
          lhs = `BA2(${b1},${b2},${idx1},${idx2})`;
        } else {
          lhs = `BA(${b1},${b2},${idx1})`;
        }
        break;
      }
      default:
        lhs = rule.detail || "A";
    }

    const op = rule.operator || "==";
    const rhs = this._normalizeValue(rule.value);

    return `${lhs}${op}${rhs}`;
  }

  /**
   * Encode a BASIC variable name (e.g. "I", "SC%", "A$") into the 2-byte
   * Applesoft memory representation.
   */
  _encodeBasicVarName(name) {
    if (!name) return { b1: 0, b2: 0 };
    name = name.toUpperCase().trim();

    let isInteger = false;
    let isString = false;
    if (name.endsWith("%")) { isInteger = true; name = name.slice(0, -1); }
    else if (name.endsWith("$")) { isString = true; name = name.slice(0, -1); }

    let b1 = name.charCodeAt(0) || 0;
    let b2 = name.length > 1 ? name.charCodeAt(1) : 0;

    if (isInteger) { b1 |= 0x80; b2 |= 0x80; }
    else if (isString) { b2 |= 0x80; }

    return { b1, b2 };
  }

  _normalizeAddress(str) {
    if (!str) return "$0000";
    str = str.trim();
    // Already has $ prefix
    if (str.startsWith("$")) return str;
    // Try to parse as hex and format
    const val = parseInt(str, 16);
    if (!isNaN(val)) return "$" + val.toString(16).toUpperCase().padStart(4, "0");
    return "$" + str;
  }

  _normalizeValue(str) {
    if (!str) return "0";
    str = str.trim();
    // Already prefixed with #$ or $ - use as-is
    if (str.startsWith("#$") || str.startsWith("$")) return str;
    // Plain decimal number
    if (/^\d+$/.test(str)) return str;
    // Hex digits without prefix - add #$
    if (/^[0-9A-Fa-f]+$/.test(str)) return "#$" + str;
    return str;
  }

  // ---- Display label (human-readable) ----

  /**
   * Generate a human-readable label from a conditionRules tree.
   * e.g. "B == 1" instead of "BV(66,0)==1"
   */
  static toDisplayLabel(node) {
    if (!node) return "";

    if (node.type === "rule") {
      return RuleBuilderWindow._displayRule(node);
    }

    // Group
    const parts = node.children
      .map((child) => RuleBuilderWindow.toDisplayLabel(child))
      .filter((s) => s.length > 0);

    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0];

    const joiner = node.logic === "AND" ? " AND " : " OR ";
    return parts.join(joiner);
  }

  static _displayRule(rule) {
    let lhs;
    switch (rule.subject) {
      case "reg":
        lhs = rule.detail || "A";
        break;
      case "flag":
        lhs = `Flag ${rule.detail || "C"}`;
        break;
      case "byte":
        lhs = `PEEK(${rule.detail || "$0000"})`;
        break;
      case "word":
        lhs = `DEEK(${rule.detail || "$0000"})`;
        break;
      case "bvar":
        lhs = rule.detail || "?";
        break;
      case "barr": {
        const name = rule.detail || "?";
        const idx1 = rule.varIndex || "0";
        if (rule.varIndex2 !== undefined && rule.varIndex2 !== "") {
          lhs = `${name}(${idx1},${rule.varIndex2})`;
        } else {
          lhs = `${name}(${idx1})`;
        }
        break;
      }
      default:
        lhs = rule.detail || "?";
    }

    const op = rule.operator || "==";
    const rhs = rule.value || "0";
    return `${lhs} ${op} ${rhs}`;
  }

  // ---- Preview ----

  updatePreview() {
    const preview = this.contentElement.querySelector("#rb-preview");
    if (!preview) return;

    const expr = this.serializeToExpression(this.rules);
    preview.textContent = expr || "(no conditions)";
  }

  // ---- Actions ----

  handleApply() {
    const expr = this.serializeToExpression(this.rules);
    const rulesCopy = JSON.parse(JSON.stringify(this.rules));

    if (this.targetMode === "basic" && this.onApplyBasic && this.targetAddress !== null) {
      this.onApplyBasic(this.targetAddress, expr, rulesCopy);
    } else if (this.onApply && this.targetAddress !== null) {
      this.onApply(this.targetAddress, expr, rulesCopy);
    }
    this.hide();
  }

  handleCancel() {
    this.hide();
  }

  handleClear() {
    this.rules = this._createEmptyGroup();
    this.renderRuleTree();
    this.updatePreview();
  }
}
