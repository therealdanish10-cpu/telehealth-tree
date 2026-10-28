const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// ============================================================================
// CATEGORY TO ROOT MAPPING (Easy to edit)
// ============================================================================
const CATEGORY_MAPPING = {
  // Health (18 categories)
  'Arts, Music & Performance': 'Health',
  'Dating, Marriage & Relationships': 'Health',
  'Health, Fitness & Wellness': 'Health',
  'Gaming & Esports': 'Health',
  'Religion & Spirituality': 'Health',
  'Food, Cooking & Hospitality': 'Health',
  'Pets, Childcare & Family Support': 'Health',
  'Sports & Recreation': 'Health',
  'Events, Parties & Social Activities': 'Health',
  'Weather, Environment & Outdoors': 'Health',
  'Social & Community Services': 'Health',
  'Personal Development & Life Skills': 'Health',
  'Healthcare Information & Caregiving': 'Health',
  'Mental Wellness, Coping & Thriving': 'Health',
  'Beauty, Fashion & Personal Style': 'Health',
  'Hobbies & Collecting': 'Health',
  'Senior, Elder & Disability Support Guidance': 'Health',
  'Travel, Hotels & Tourism': 'Health',

  // Wealth (29 categories)
  'Languages & Communication': 'Wealth',
  'Home Repair & Practical Skills': 'Wealth',
  'Education, Science & Mathematics': 'Wealth',
  'Technology, IT & AI': 'Wealth',
  'Business, Sales & Entrepreneurship': 'Wealth',
  'Finance, Taxes & Investing': 'Wealth',
  'Legal & Administrative Guidance': 'Wealth',
  'Government, Politics & Current Affairs': 'Wealth',
  'Real Estate & Property': 'Wealth',
  'Writing, Media & Content Creation': 'Wealth',
  'Virtual Assistance & Office Skills': 'Wealth',
  'General Advice & Other Skills': 'Wealth',
  'Social Media & Online Presence': 'Wealth',
  'Automobiles & Transportation': 'Wealth',
  'Cryptocurrency & Digital Assets': 'Wealth',
  'Gambling, Poker & Betting Strategy': 'Wealth',
  'Grants, Funding & Loans': 'Wealth',
  'News, Media & Information Literacy': 'Wealth',
  'AI, Automation & Future Skills': 'Wealth',
  'IT Support, Cybersecurity & Networking': 'Wealth',
  'Remote Work, Freelancing & Online Jobs': 'Wealth',
  'Skilled Trades & Vocational Training': 'Wealth',
  'Careers, Jobs & Study Abroad': 'Wealth',
  'Agriculture & Farming': 'Wealth',
  'Math, Statistics & Data Analysis': 'Wealth',
  'Astronomy & Space': 'Wealth',
  'Customer Service & Call Center Skills': 'Wealth',
  'Design, UX & Creative Tech': 'Wealth',
  'Anything Else (Not Listed)': 'Wealth'
};

const EXCEL_PATH = path.join(__dirname, '..', 'source', 'TeleHealth_Today_Categories_Columns.xlsx');
const EXTRA_TOPICS_PATH = path.join(__dirname, '..', 'source', 'extra-topics.txt');
const OUTPUT_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'tree.json');

function buildTree() {
  const warnings = [];
  const roots = {
    Health: {
      name: 'Health',
      description: 'Personal well-being, lifestyle, relationships, caregiving, recreation, creative arts, and community living.',
      children: []
    },
    Wealth: {
      name: 'Wealth',
      description: 'Careers, business, finance, technology, practical trades, education, legal guidance, and professional skills.',
      children: []
    }
  };

  // Map from exact category name -> category node reference
  const categoryMap = new Map();
  // Map from category node reference -> Set of lowercase topic names for deduplication
  const categoryTopicSets = new WeakMap();

  function getOrCreateCategory(categoryName, rootName) {
    const cleanName = categoryName.trim();
    if (categoryMap.has(cleanName)) {
      return categoryMap.get(cleanName);
    }
    const targetRoot = roots[rootName] || roots.Wealth;
    const catNode = {
      name: cleanName,
      children: []
    };
    targetRoot.children.push(catNode);
    categoryMap.set(cleanName, catNode);
    categoryTopicSets.set(catNode, new Set());
    return catNode;
  }

  function addTopicToCategory(catNode, rawTopic) {
    const topicName = String(rawTopic).trim();
    if (!topicName) return false;

    const seenSet = categoryTopicSets.get(catNode);
    const lowerKey = topicName.toLowerCase();
    if (seenSet.has(lowerKey)) {
      return false;
    }
    seenSet.add(lowerKey);
    catNode.children.push({ name: topicName });
    return true;
  }

  // 1. Read Excel file
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`Excel file not found at: ${EXCEL_PATH}`);
  }

  const workbook = XLSX.readFile(EXCEL_PATH);
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert sheet to 2D array of rows (header row = row 0)
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (rows.length === 0) {
    throw new Error('Excel sheet is empty.');
  }

  const headerRow = rows[0];
  const colCategories = [];

  for (let colIdx = 0; colIdx < headerRow.length; colIdx++) {
    const rawCatName = String(headerRow[colIdx] || '').trim();
    if (!rawCatName) {
      colCategories[colIdx] = null;
      continue;
    }

    let mappedRoot = CATEGORY_MAPPING[rawCatName];
    if (!mappedRoot) {
      const warnMsg = `Excel category "${rawCatName}" not found in mapping; defaulting to Wealth.`;
      warnings.push(warnMsg);
      console.warn(`[WARNING] ${warnMsg}`);
      mappedRoot = 'Wealth';
    }

    const catNode = getOrCreateCategory(rawCatName, mappedRoot);
    colCategories[colIdx] = catNode;
  }

  let excelTopicsCount = 0;
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    if (!row) continue;
    for (let colIdx = 0; colIdx < colCategories.length; colIdx++) {
      const catNode = colCategories[colIdx];
      if (!catNode) continue;
      const cellValue = row[colIdx];
      if (cellValue !== undefined && cellValue !== null && String(cellValue).trim() !== '') {
        if (addTopicToCategory(catNode, cellValue)) {
          excelTopicsCount++;
        }
      }
    }
  }

  // 2. Read source/extra-topics.txt
  let extraTopicsAdded = 0;
  if (fs.existsSync(EXTRA_TOPICS_PATH)) {
    const content = fs.readFileSync(EXTRA_TOPICS_PATH, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((rawLine, idx) => {
      const lineNumber = idx + 1;
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        return;
      }

      if (line.startsWith('@')) {
        // Format: @Health :: Category Name :: topic 1 | topic 2
        const parts = line.split('::').map(p => p.trim());
        if (parts.length < 3) {
          const warnMsg = `Line ${lineNumber}: Invalid new category line format: "${line}"`;
          warnings.push(warnMsg);
          console.warn(`[WARNING] ${warnMsg}`);
          return;
        }
        const rootDirective = parts[0].substring(1).trim(); // Remove '@'
        const categoryName = parts[1];
        const topicsPart = parts.slice(2).join('::');

        let rootName = 'Wealth';
        if (rootDirective.toLowerCase() === 'health') {
          rootName = 'Health';
        } else if (rootDirective.toLowerCase() === 'wealth') {
          rootName = 'Wealth';
        } else {
          const warnMsg = `Line ${lineNumber}: Unknown root "@${rootDirective}" for category "${categoryName}"; defaulting to Wealth.`;
          warnings.push(warnMsg);
          console.warn(`[WARNING] ${warnMsg}`);
        }

        const catNode = getOrCreateCategory(categoryName, rootName);
        const topics = topicsPart.split('|');
        for (const t of topics) {
          if (addTopicToCategory(catNode, t)) {
            extraTopicsAdded++;
          }
        }
      } else {
        // Normal line: Category Name :: topic 1 | topic 2 | topic 3
        const parts = line.split('::').map(p => p.trim());
        if (parts.length < 2) {
          const warnMsg = `Line ${lineNumber}: Invalid line format: "${line}"`;
          warnings.push(warnMsg);
          console.warn(`[WARNING] ${warnMsg}`);
          return;
        }
        const categoryName = parts[0];
        const topicsPart = parts.slice(1).join('::');

        let catNode = categoryMap.get(categoryName);
        if (!catNode) {
          const warnMsg = `Line ${lineNumber}: Category "${categoryName}" not found; creating under Wealth.`;
          warnings.push(warnMsg);
          console.warn(`[WARNING] ${warnMsg}`);
          catNode = getOrCreateCategory(categoryName, 'Wealth');
        }

        const topics = topicsPart.split('|');
        for (const t of topics) {
          if (addTopicToCategory(catNode, t)) {
            extraTopicsAdded++;
          }
        }
      }
    });
  } else {
    const warnMsg = `Extra topics file not found at: ${EXTRA_TOPICS_PATH}`;
    warnings.push(warnMsg);
    console.warn(`[WARNING] ${warnMsg}`);
  }

  // Write data/tree.json
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const treeData = [roots.Health, roots.Wealth];
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(treeData, null, 2), 'utf8');

  const healthCategories = roots.Health.children.length;
  const wealthCategories = roots.Wealth.children.length;
  const totalCategories = healthCategories + wealthCategories;

  const healthTopics = roots.Health.children.reduce((sum, c) => sum + c.children.length, 0);
  const wealthTopics = roots.Wealth.children.reduce((sum, c) => sum + c.children.length, 0);
  const totalTopics = healthTopics + wealthTopics;

  console.log('====================================================');
  console.log('TeleHealth Today Knowledge Tree - Build Summary');
  console.log('====================================================');
  console.log(`Total Categories           : ${totalCategories} (Health: ${healthCategories}, Wealth: ${wealthCategories})`);
  console.log(`Total Topics               : ${totalTopics} (Health: ${healthTopics}, Wealth: ${wealthTopics})`);
  console.log(`Topics from Excel          : ${excelTopicsCount}`);
  console.log(`Topics added from extra.txt: ${extraTopicsAdded}`);
  console.log(`Warnings                   : ${warnings.length}`);
  if (warnings.length > 0) {
    warnings.forEach(w => console.log(`  - ${w}`));
  }
  console.log(`Output written to          : ${OUTPUT_PATH}`);
  console.log('====================================================');
}

buildTree();
