import { BaseWindow } from "../windows/base-window.js";

/**
 * RuleBuilderWindow - Visual query-builder UI for breakpoint conditions.
 * Users compose conditions by adding rules and groups through dropdowns.
 */
export class RuleBuilderWindow extends BaseWindow {
  constructor() {
    super({
      id: "rule-builder",
      title: "Condition Rule Builder",
      minWidth: 420,
      minHeight: 300,
      defaultWidth: 540,
      defaultHeight: 440,
      defaultPosition: { x: 200, y: 120 },
    });

    this.rules = null; // Root group node
    this.targetAddress = null;
    this.onApply = null; // Callback: (address, conditionString, conditionRules) => {}
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
   * Open the rule builder for a specific breakpoint.
   * Called by the CPU debugger.
   */
  editBreakpoint(address, entry) {
    this.targetAddress = address;

    const label = this.contentElement.querySelector("#rb-target-label");
    if (label) {
      label.textContent = `Condition for $${this.formatHex(address, 4)}`;
    }

    if (entry && entry.conditionRules) {
      // Deep clone so edits don't mutate until Apply
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

    const accentColors = ["#58a6ff", "#bc8cff", "#f0883e", "#3fb950", "#f778ba"];
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
    subjectSelect.innerHTML = `
      <option value="reg" ${rule.subject === "reg" ? "selected" : ""}>Register</option>
      <option value="flag" ${rule.subject === "flag" ? "selected" : ""}>Flag</option>
      <option value="byte" ${rule.subject === "byte" ? "selected" : ""}>Byte</option>
      <option value="word" ${rule.subject === "word" ? "selected" : ""}>Word</option>
    `;
    subjectSelect.addEventListener("change", () => {
      rule.subject = subjectSelect.value;
      // Reset detail to sensible default
      if (rule.subject === "reg") rule.detail = "A";
      else if (rule.subject === "flag") rule.detail = "C";
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
      default:
        lhs = rule.detail || "A";
    }

    const op = rule.operator || "==";
    const rhs = this._normalizeValue(rule.value);

    return `${lhs}${op}${rhs}`;
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
    if (this.onApply && this.targetAddress !== null) {
      // Deep clone rules for storage
      const rulesCopy = JSON.parse(JSON.stringify(this.rules));
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
