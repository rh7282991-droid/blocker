import type {
  Rule,
  RuleCondition,
  RuleResult,
  ConditionalRule,
  SupportedSite,
} from './types';

/**
 * Condition evaluator function type.
 * Returns true if the condition is satisfied for the given element.
 */
type ConditionEvaluator = (
  condition: RuleCondition,
  element: Element
) => boolean;

/**
 * Type guard to check if a rule is a ConditionalRule
 */
function isConditionalRule(rule: Rule): rule is ConditionalRule {
  return 'conditions' in rule && Array.isArray((rule as ConditionalRule).conditions);
}

/**
 * RuleEngine evaluates rules against DOM elements.
 *
 * Designed for extensibility: new condition types can be registered
 * via registerConditionEvaluator() without modifying the core evaluate logic.
 */
export class RuleEngine {
  private rules: Rule[];
  private conditionEvaluators: Map<string, ConditionEvaluator>;

  constructor(rules: Rule[]) {
    this.rules = [...rules];
    this.conditionEvaluators = new Map();
  }

  /**
   * Register a condition evaluator for a given condition type.
   * This enables extensibility - V2 can add 'keyword', 'time-of-day', etc.
   * without modifying the core evaluation logic.
   */
  registerConditionEvaluator(type: string, evaluator: ConditionEvaluator): void {
    this.conditionEvaluators.set(type, evaluator);
  }

  /**
   * Unregister a condition evaluator by type.
   */
  unregisterConditionEvaluator(type: string): void {
    this.conditionEvaluators.delete(type);
  }

  /**
   * Evaluate all rules for a given site against a DOM element.
   * Returns an array of RuleResults for rules that matched.
   */
  evaluateElement(element: Element, site: SupportedSite): RuleResult[] {
    const siteRules = this.getRulesForSite(site);
    const results: RuleResult[] = [];

    for (const rule of siteRules) {
      const matched = this.matchesRule(element, rule);
      if (matched) {
        results.push({
          matched: true,
          action: rule.action,
          element,
          rule,
        });
      }
    }

    return results;
  }

  /**
   * Check if a DOM element matches a rule's selectors and conditions.
   */
  matchesRule(element: Element, rule: Rule): boolean {
    const selectorMatch = this.matchesSelectors(element, rule.selectors);
    if (!selectorMatch) {
      return false;
    }

    // If this is a conditional rule, evaluate all conditions
    if (isConditionalRule(rule)) {
      return this.evaluateConditions(rule.conditions, element);
    }

    return true;
  }

  /**
   * Add a rule to the engine.
   */
  addRule(rule: Rule): void {
    this.rules.push(rule);
  }

  /**
   * Remove a rule by its ID.
   */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter((r) => r.id !== ruleId);
  }

  /**
   * Get all rules that apply to a specific site.
   */
  getRulesForSite(site: SupportedSite): Rule[] {
    return this.rules.filter((r) => r.site === site);
  }

  /**
   * Replace all rules with a new set.
   */
  updateRules(rules: Rule[]): void {
    this.rules = [...rules];
  }

  /**
   * Check if an element matches any of the given selectors.
   * Uses element.matches() for direct matching and element.closest() for ancestor matching.
   */
  private matchesSelectors(element: Element, selectors: string[]): boolean {
    for (const selector of selectors) {
      try {
        if (element.matches(selector) || element.closest(selector)) {
          return true;
        }
      } catch {
        // Invalid selector - skip it
        continue;
      }
    }
    return false;
  }

  /**
   * Evaluate all conditions using the registered condition evaluators.
   * All conditions must pass (AND logic) for the rule to match.
   */
  private evaluateConditions(
    conditions: RuleCondition[],
    element: Element
  ): boolean {
    for (const condition of conditions) {
      const evaluator = this.conditionEvaluators.get(condition.type);
      if (!evaluator) {
        // Unknown condition type - condition fails (safe default)
        return false;
      }
      if (!evaluator(condition, element)) {
        return false;
      }
    }
    return true;
  }
}
