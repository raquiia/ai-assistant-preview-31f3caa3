export const industries = [
  "aeronautique",
  "defense",
  "automobile",
  "transport/rail",
  "pharma",
  "energie",
  "nucleaire",
  "manufacturing",
  "IT/digital",
  "finance",
  "secteur public",
  "infrastructure",
  "autres"
] as const;

export const pmDomains = [
  "planning/scheduling",
  "cost control",
  "risk management",
  "scope/requirements",
  "change control",
  "PMO governance",
  "portfolio management",
  "resource management",
  "quality",
  "reporting/KPI",
  "earned value",
  "procurement",
  "stakeholder management",
  "agile/delivery",
  "tools P6/MS Project/Jira/Smartsheet",
  "compliance"
] as const;

export function classifyText(text: string): { industryTags: string[]; pmDomainTags: string[] } {
  const lower = text.toLowerCase();
  const industryTags = industries.filter((tag) => lower.includes(tag.toLowerCase()));
  const pmDomainTags = pmDomains.filter((tag) => {
    const normalized = tag.toLowerCase().split(/[ /-]/).filter(Boolean);
    return normalized.some((word) => lower.includes(word));
  });

  if (/\bplanning|schedule|jalon|chemin critique|baseline\b/i.test(text) && !pmDomainTags.includes("planning/scheduling")) {
    pmDomainTags.push("planning/scheduling");
  }
  if (/\brisk|risque|mitigation|probability|impact\b/i.test(text) && !pmDomainTags.includes("risk management")) {
    pmDomainTags.push("risk management");
  }
  if (industryTags.length === 0) industryTags.push("autres");
  if (pmDomainTags.length === 0) pmDomainTags.push("PMO governance");

  return { industryTags, pmDomainTags };
}
