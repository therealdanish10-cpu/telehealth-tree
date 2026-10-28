/**
 * TeleHealth Today — Interactive Knowledge Tree
 * Plain Vanilla JS | Arbitrary-Depth Recursive Lazy Renderer | Live Search & Accessibility
 */

(function () {
  'use strict';

  const TREE_DATA_URL = 'data/tree.json';

  // Application State
  const state = {
    roots: [],
    nodeById: new Map(),
    totalCategories: 0,
    totalTopics: 0,
    expandedIds: new Set(),
    savedExpandedBeforeSearch: null,
    selectedId: null,
    searchQuery: '',
    filteredMatchMap: null // Map<nodeId, { selfMatches: boolean, hasMatchingDescendant: boolean }>
  };

  // DOM Elements
  const dom = {
    treeRoot: document.getElementById('tree-root'),
    treeLoading: document.getElementById('tree-loading'),
    treeError: document.getElementById('tree-error'),
    treeEmpty: document.getElementById('tree-empty'),
    countRoots: document.getElementById('count-roots'),
    countCategories: document.getElementById('count-categories'),
    countTopics: document.getElementById('count-topics'),
    searchInput: document.getElementById('tree-search'),
    searchClear: document.getElementById('search-clear'),
    searchStatus: document.getElementById('search-status'),
    btnResetSearch: document.getElementById('btn-reset-search'),
    btnExpandAll: document.getElementById('btn-expand-all'),
    btnCollapseAll: document.getElementById('btn-collapse-all'),
    breadcrumbList: document.getElementById('breadcrumb-list'),
    detailPanel: document.getElementById('detail-panel'),
    panelBackdrop: document.getElementById('panel-backdrop'),
    detailCloseBtn: document.getElementById('detail-close-btn'),
    detailRootBadge: document.getElementById('detail-root-badge'),
    detailTitle: document.getElementById('detail-title'),
    detailPath: document.getElementById('detail-path'),
    detailDescription: document.getElementById('detail-description'),
    detailTagsWrapper: document.getElementById('detail-tags-wrapper'),
    detailTags: document.getElementById('detail-tags'),
    detailSubtopicsWrapper: document.getElementById('detail-subtopics-wrapper'),
    detailSubtopicsHeading: document.getElementById('detail-subtopics-heading'),
    detailSubtopicsCount: document.getElementById('detail-subtopics-count'),
    detailSubtopicsList: document.getElementById('detail-subtopics-list')
  };

  // ============================================================================
  // Initialization & Data Loading
  // ============================================================================
  async function init() {
    bindEvents();

    try {
      const response = await fetch(TREE_DATA_URL);
      if (!response.ok) {
        throw new Error(`Unable to load ${TREE_DATA_URL} (HTTP ${response.status})`);
      }
      const rawData = await response.json();
      const rootArray = Array.isArray(rawData)
        ? rawData
        : Array.isArray(rawData.children)
          ? rawData.children
          : [];

      prepareTreeData(rootArray);
      updateCounterUI();

      // Expand the two root pillars by default so categories are immediately visible,
      // while all deeper levels remain collapsed and lazy-rendered on demand.
      state.roots.forEach((rootNode) => {
        state.expandedIds.add(rootNode.id);
      });

      dom.treeLoading.hidden = true;
      renderTree();

      // Pre-populate the desktop side panel with the first root node (without opening mobile sheet)
      if (state.roots.length > 0) {
        selectNode(state.roots[0].id, { openMobileSheet: false, scrollIntoView: false });
      }
    } catch (err) {
      console.error('Failed to initialize Knowledge Tree:', err);
      dom.treeLoading.hidden = true;
      dom.treeError.hidden = false;
      dom.treeError.textContent = 'Could not load the knowledge tree data. Please refresh the page or check data/tree.json.';
    }
  }

  /**
   * Recursively indexes nodes of arbitrary depth and computes counts.
   */
  function prepareTreeData(rootArray) {
    state.roots = rootArray;
    state.nodeById.clear();
    let categoriesCount = 0;
    let topicsCount = 0;

    function traverse(node, depth, parentNode, rootNode, idPrefix) {
      node.id = idPrefix;
      node.depth = depth;
      node.parentId = parentNode ? parentNode.id : null;
      node.rootName = rootNode ? rootNode.name : node.name;
      node.theme = String(node.rootName).toLowerCase() === 'health' ? 'health' : 'wealth';
      node.pathNames = parentNode ? [...parentNode.pathNames, node.name] : [node.name];
      node.pathIds = parentNode ? [...parentNode.pathIds, node.id] : [node.id];

      state.nodeById.set(node.id, node);

      if (depth === 1) {
        categoriesCount++;
      } else if (depth >= 2) {
        topicsCount++;
      }

      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      let totalDescendants = 0;

      if (hasChildren) {
        node.children.forEach((child, index) => {
          totalDescendants += traverse(child, depth + 1, node, rootNode || node, `${idPrefix}-${index}`);
        });
      }

      node.descendantCount = totalDescendants;
      return 1 + totalDescendants;
    }

    state.roots.forEach((rootNode, rIdx) => {
      traverse(rootNode, 0, null, rootNode, `node-${rIdx}`);
    });

    state.totalCategories = categoriesCount;
    state.totalTopics = topicsCount;
  }

  function updateCounterUI() {
    dom.countRoots.textContent = state.roots.length.toLocaleString();
    dom.countCategories.textContent = state.totalCategories.toLocaleString();
    dom.countTopics.textContent = state.totalTopics.toLocaleString();
  }

  // ============================================================================
  // Rendering Logic (Recursive + Lazy Rendering)
  // ============================================================================
  function renderTree() {
    dom.treeRoot.innerHTML = '';
    const isSearching = state.searchQuery.length > 0;
    let visibleRootCount = 0;

    state.roots.forEach((rootNode) => {
      if (isSearching && !shouldRenderNodeInSearch(rootNode.id)) {
        return;
      }
      visibleRootCount++;
      const rootCardEl = createRootCardElement(rootNode);
      dom.treeRoot.appendChild(rootCardEl);
    });

    dom.treeEmpty.hidden = visibleRootCount > 0;
  }

  /**
   * Builds a top-level Root Pillar Card (Health or Wealth)
   */
  function createRootCardElement(rootNode) {
    const isExpanded = state.expandedIds.has(rootNode.id);
    const isSelected = state.selectedId === rootNode.id;
    const visibleChildren = getVisibleChildren(rootNode);

    const card = document.createElement('div');
    card.className = 'root-branch-card';
    card.dataset.rootTheme = rootNode.theme;
    card.dataset.nodeId = rootNode.id;

    // Interactive root header row
    const headerBtn = document.createElement('button');
    headerBtn.type = 'button';
    headerBtn.className = `root-node-row${isSelected ? ' is-selected' : ''}`;
    headerBtn.id = `treeitem-${rootNode.id}`;
    headerBtn.setAttribute('role', 'treeitem');
    headerBtn.setAttribute('aria-expanded', String(isExpanded));
    headerBtn.setAttribute('aria-selected', String(isSelected));
    headerBtn.dataset.nodeId = rootNode.id;

    // Left icon + title + description
    const mainDiv = document.createElement('div');
    mainDiv.className = 'root-node-main';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'root-icon-badge';
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.innerHTML = rootNode.theme === 'health' ? getHealthIconSVG() : getWealthIconSVG();

    const titleGroup = document.createElement('div');
    titleGroup.className = 'root-title-group';

    const titleEl = document.createElement('h2');
    titleEl.className = 'root-title';
    titleEl.innerHTML = highlightText(rootNode.name, state.searchQuery);

    titleGroup.appendChild(titleEl);

    if (rootNode.description) {
      const subEl = document.createElement('p');
      subEl.className = 'root-subtitle';
      subEl.textContent = rootNode.description;
      titleGroup.appendChild(subEl);
    }

    mainDiv.appendChild(iconSpan);
    mainDiv.appendChild(titleGroup);

    // Right badge + chevron
    const metaDiv = document.createElement('div');
    metaDiv.className = 'root-meta';

    const countBadge = document.createElement('span');
    countBadge.className = 'node-count-badge';
    countBadge.title = `${visibleChildren.length} categories`;
    countBadge.textContent = `${visibleChildren.length} categories`;

    const chevron = document.createElement('span');
    chevron.className = `node-chevron${isExpanded ? ' is-open' : ''}`;
    chevron.setAttribute('aria-hidden', 'true');
    chevron.innerHTML = getChevronSVG();

    metaDiv.appendChild(countBadge);
    metaDiv.appendChild(chevron);

    headerBtn.appendChild(mainDiv);
    headerBtn.appendChild(metaDiv);

    // Smooth animator container for children
    const animator = document.createElement('div');
    animator.className = `tree-children-animator${isExpanded ? ' is-expanded' : ''}`;
    animator.id = `children-animator-${rootNode.id}`;

    const inner = document.createElement('div');
    inner.className = 'tree-children-inner';
    inner.id = `children-inner-${rootNode.id}`;

    // Lazy rendering: only build child DOM elements if expanded
    if (isExpanded && visibleChildren.length > 0) {
      const bodyWrapper = document.createElement('div');
      bodyWrapper.className = 'root-children-body';
      bodyWrapper.appendChild(createChildrenGroupElement(rootNode, visibleChildren));
      inner.appendChild(bodyWrapper);
    }

    animator.appendChild(inner);
    card.appendChild(headerBtn);
    card.appendChild(animator);

    return card;
  }

  /**
   * Recursively builds a <ul class="tree-group" role="group"> for any depth
   */
  function createChildrenGroupElement(parentNode, childrenNodes) {
    const ul = document.createElement('ul');
    ul.className = 'tree-group';
    ul.setAttribute('role', 'group');

    childrenNodes.forEach((childNode) => {
      const li = createTreeItemElement(childNode);
      ul.appendChild(li);
    });

    return ul;
  }

  /**
   * Builds a single <li class="tree-item"> at depth >= 1 (supports arbitrary depth)
   */
  function createTreeItemElement(node) {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const isExpanded = hasChildren && state.expandedIds.has(node.id);
    const isSelected = state.selectedId === node.id;
    const visibleChildren = hasChildren ? getVisibleChildren(node) : [];

    const li = document.createElement('li');
    li.className = 'tree-item';
    li.dataset.nodeId = node.id;

    const rowBtn = document.createElement('button');
    rowBtn.type = 'button';
    rowBtn.className = `tree-node-row ${hasChildren ? 'is-branch' : 'is-leaf'}${isSelected ? ' is-selected' : ''}`;
    rowBtn.id = `treeitem-${node.id}`;
    rowBtn.setAttribute('role', 'treeitem');
    if (hasChildren) {
      rowBtn.setAttribute('aria-expanded', String(isExpanded));
    }
    rowBtn.setAttribute('aria-selected', String(isSelected));
    rowBtn.dataset.nodeId = node.id;

    const leftSpan = document.createElement('span');
    leftSpan.className = 'node-left';

    if (hasChildren) {
      const chevron = document.createElement('span');
      chevron.className = `node-chevron${isExpanded ? ' is-open' : ''}`;
      chevron.setAttribute('aria-hidden', 'true');
      chevron.innerHTML = getChevronSVG();
      leftSpan.appendChild(chevron);
    } else {
      const bullet = document.createElement('span');
      bullet.className = 'node-leaf-bullet';
      bullet.setAttribute('aria-hidden', 'true');
      leftSpan.appendChild(bullet);
    }

    const labelSpan = document.createElement('span');
    labelSpan.className = 'node-label';
    labelSpan.innerHTML = highlightText(node.name, state.searchQuery);
    leftSpan.appendChild(labelSpan);

    rowBtn.appendChild(leftSpan);

    if (hasChildren) {
      const badge = document.createElement('span');
      badge.className = 'node-count-badge';
      badge.title = `${visibleChildren.length} items`;
      badge.textContent = visibleChildren.length.toLocaleString();
      rowBtn.appendChild(badge);
    }

    li.appendChild(rowBtn);

    if (hasChildren) {
      const animator = document.createElement('div');
      animator.className = `tree-children-animator${isExpanded ? ' is-expanded' : ''}`;
      animator.id = `children-animator-${node.id}`;

      const inner = document.createElement('div');
      inner.className = 'tree-children-inner';
      inner.id = `children-inner-${node.id}`;

      // Lazy render: only create child DOM elements when expanded
      if (isExpanded && visibleChildren.length > 0) {
        inner.appendChild(createChildrenGroupElement(node, visibleChildren));
      }

      animator.appendChild(inner);
      li.appendChild(animator);
    }

    return li;
  }

  // ============================================================================
  // Lazy Toggle Expand / Collapse with Gentle Animation
  // ============================================================================
  function toggleNodeExpansion(nodeId, forceExpand) {
    const node = state.nodeById.get(nodeId);
    if (!node || !Array.isArray(node.children) || node.children.length === 0) {
      return;
    }

    const currentlyExpanded = state.expandedIds.has(nodeId);
    const nextExpanded = typeof forceExpand === 'boolean' ? forceExpand : !currentlyExpanded;

    if (currentlyExpanded === nextExpanded) {
      return;
    }

    const rowBtn = document.getElementById(`treeitem-${nodeId}`);
    const animator = document.getElementById(`children-animator-${nodeId}`);
    const inner = document.getElementById(`children-inner-${nodeId}`);

    if (nextExpanded) {
      state.expandedIds.add(nodeId);
      if (rowBtn) {
        rowBtn.setAttribute('aria-expanded', 'true');
        const chevron = rowBtn.querySelector('.node-chevron');
        if (chevron) chevron.classList.add('is-open');
      }

      // Lazy render children into inner container right before expanding
      if (inner && inner.children.length === 0) {
        const visibleChildren = getVisibleChildren(node);
        if (visibleChildren.length > 0) {
          if (node.depth === 0) {
            const bodyWrapper = document.createElement('div');
            bodyWrapper.className = 'root-children-body';
            bodyWrapper.appendChild(createChildrenGroupElement(node, visibleChildren));
            inner.appendChild(bodyWrapper);
          } else {
            inner.appendChild(createChildrenGroupElement(node, visibleChildren));
          }
        }
      }

      if (animator) {
        // Trigger reflow so the CSS grid transition animates smoothly from 0fr -> 1fr
        void animator.offsetWidth;
        animator.classList.add('is-expanded');
      }
    } else {
      state.expandedIds.delete(nodeId);
      if (rowBtn) {
        rowBtn.setAttribute('aria-expanded', 'false');
        const chevron = rowBtn.querySelector('.node-chevron');
        if (chevron) chevron.classList.remove('is-open');
      }

      if (animator) {
        animator.classList.remove('is-expanded');
        // Clean up child DOM after collapse animation completes to keep DOM lightweight
        const onTransitionEnd = (e) => {
          if (e.target !== animator) return;
          animator.removeEventListener('transitionend', onTransitionEnd);
          if (!state.expandedIds.has(nodeId) && inner) {
            inner.innerHTML = '';
          }
        };
        animator.addEventListener('transitionend', onTransitionEnd);
      }
    }
  }

  /**
   * Expand all or Collapse all nodes
   */
  function expandAll() {
    state.nodeById.forEach((node) => {
      if (Array.isArray(node.children) && node.children.length > 0) {
        if (!state.searchQuery || shouldRenderNodeInSearch(node.id)) {
          state.expandedIds.add(node.id);
        }
      }
    });
    renderTree();
  }

  function collapseAll() {
    state.expandedIds.clear();
    // Collapse everything down to the two top-level root nodes (or keep roots collapsed too)
    // Keeping roots collapsed shows the two big root nodes cleanly at the top.
    renderTree();
  }

  // ============================================================================
  // Selection, Breadcrumb Path, and Side Panel (Bottom Sheet on Mobile)
  // ============================================================================
  function selectNode(nodeId, options = {}) {
    const { openMobileSheet = true, scrollIntoView = false } = options;
    const node = state.nodeById.get(nodeId);
    if (!node) return;

    // Ensure all ancestors are expanded so the selected node exists in DOM
    for (let i = 0; i < node.pathIds.length - 1; i++) {
      const ancestorId = node.pathIds[i];
      if (!state.expandedIds.has(ancestorId)) {
        toggleNodeExpansion(ancestorId, true);
      }
    }

    // Update previous selection styling
    if (state.selectedId) {
      const prevBtn = document.getElementById(`treeitem-${state.selectedId}`);
      if (prevBtn) {
        prevBtn.classList.remove('is-selected');
        prevBtn.setAttribute('aria-selected', 'false');
      }
    }

    state.selectedId = nodeId;
    const currentBtn = document.getElementById(`treeitem-${nodeId}`);
    if (currentBtn) {
      currentBtn.classList.add('is-selected');
      currentBtn.setAttribute('aria-selected', 'true');
      if (scrollIntoView) {
        currentBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        currentBtn.focus({ preventScroll: true });
      }
    }

    updateBreadcrumb(node);
    updateDetailPanel(node);

    if (openMobileSheet && window.matchMedia('(max-width: 960px)').matches) {
      openMobileDetailSheet();
    }
  }

  function updateBreadcrumb(node) {
    dom.breadcrumbList.innerHTML = '';

    node.pathIds.forEach((ancestorId, index) => {
      const ancestorNode = state.nodeById.get(ancestorId);
      if (!ancestorNode) return;

      const li = document.createElement('li');
      li.className = 'breadcrumb-item';

      if (index > 0) {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-separator';
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = '>';
        li.appendChild(sep);
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      const isCurrent = index === node.pathIds.length - 1;
      btn.className = `breadcrumb-btn${isCurrent ? ' is-current' : ''}`;
      if (isCurrent) {
        btn.setAttribute('aria-current', 'location');
      }
      btn.textContent = ancestorNode.name;
      btn.addEventListener('click', () => {
        if (Array.isArray(ancestorNode.children) && ancestorNode.children.length > 0) {
          toggleNodeExpansion(ancestorNode.id, true);
        }
        selectNode(ancestorNode.id, { openMobileSheet: true, scrollIntoView: true });
      });

      li.appendChild(btn);
      dom.breadcrumbList.appendChild(li);
    });
  }

  function updateDetailPanel(node) {
    dom.detailPanel.dataset.theme = node.theme;
    dom.detailRootBadge.textContent = node.rootName;
    dom.detailTitle.textContent = node.name;
    dom.detailPath.textContent = node.pathNames.join(' > ');

    // Description: use node.description if present, otherwise provide helpful context
    if (node.description) {
      dom.detailDescription.textContent = node.description;
    } else if (Array.isArray(node.children) && node.children.length > 0) {
      dom.detailDescription.textContent = `Browse ${node.children.length.toLocaleString()} sub-topics under ${node.name}. Select any topic below to explore or book an appointment with an expert on TeleHealth Today.`;
    } else {
      const parentNode = node.parentId ? state.nodeById.get(node.parentId) : null;
      const categoryContext = parentNode ? ` in ${parentNode.name}` : '';
      dom.detailDescription.textContent = `Learn about "${node.name}"${categoryContext}, teach others what you know, or book a 1-on-1 session with an experienced specialist on TeleHealth Today.`;
    }

    // Optional Tags
    if (Array.isArray(node.tags) && node.tags.length > 0) {
      dom.detailTagsWrapper.hidden = false;
      dom.detailTags.innerHTML = '';
      node.tags.forEach((tag) => {
        const span = document.createElement('span');
        span.className = 'detail-tag';
        span.textContent = tag;
        dom.detailTags.appendChild(span);
      });
    } else {
      dom.detailTagsWrapper.hidden = true;
      dom.detailTags.innerHTML = '';
    }

    // Sub-topics list
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    if (hasChildren) {
      dom.detailSubtopicsWrapper.hidden = false;
      dom.detailSubtopicsHeading.textContent = node.depth === 0 ? 'Categories' : 'Sub-topics';
      dom.detailSubtopicsCount.textContent = node.children.length.toLocaleString();
      dom.detailSubtopicsList.innerHTML = '';

      node.children.forEach((child) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'detail-subtopic-btn';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = child.name;
        btn.appendChild(nameSpan);

        if (Array.isArray(child.children) && child.children.length > 0) {
          const countSpan = document.createElement('span');
          countSpan.className = 'node-count-badge';
          countSpan.textContent = child.children.length.toLocaleString();
          btn.appendChild(countSpan);
        }

        btn.addEventListener('click', () => {
          toggleNodeExpansion(node.id, true);
          if (Array.isArray(child.children) && child.children.length > 0) {
            toggleNodeExpansion(child.id, true);
          }
          selectNode(child.id, { openMobileSheet: false, scrollIntoView: true });
        });

        li.appendChild(btn);
        dom.detailSubtopicsList.appendChild(li);
      });
    } else {
      dom.detailSubtopicsWrapper.hidden = true;
      dom.detailSubtopicsList.innerHTML = '';
    }
  }

  function openMobileDetailSheet() {
    dom.panelBackdrop.hidden = false;
    void dom.panelBackdrop.offsetWidth;
    dom.panelBackdrop.classList.add('is-open');
    dom.detailPanel.classList.add('is-mobile-open');
  }

  function closeMobileDetailSheet() {
    dom.panelBackdrop.classList.remove('is-open');
    dom.detailPanel.classList.remove('is-mobile-open');
    setTimeout(() => {
      if (!dom.panelBackdrop.classList.contains('is-open')) {
        dom.panelBackdrop.hidden = true;
      }
    }, 500);
  }

  // ============================================================================
  // Live Search Filtering, Auto-Expand & Highlighting
  // ============================================================================
  function handleSearchInput(rawQuery) {
    const query = rawQuery.trim();
    dom.searchClear.hidden = query.length === 0;

    if (query === state.searchQuery) {
      return;
    }

    // Save user's manual expansion state before starting a search
    if (state.searchQuery === '' && query !== '') {
      state.savedExpandedBeforeSearch = new Set(state.expandedIds);
    }

    state.searchQuery = query;

    if (!query) {
      state.filteredMatchMap = null;
      dom.searchStatus.hidden = true;
      dom.searchStatus.textContent = '';

      if (state.savedExpandedBeforeSearch) {
        state.expandedIds = new Set(state.savedExpandedBeforeSearch);
        state.savedExpandedBeforeSearch = null;
      }
      renderTree();
      return;
    }

    const lowerQuery = query.toLowerCase();
    const matchMap = new Map();
    let matchedNodesCount = 0;

    function evaluateNode(node, ancestorMatched) {
      const nameMatches = node.name.toLowerCase().includes(lowerQuery);
      const descMatches = Boolean(node.description && node.description.toLowerCase().includes(lowerQuery));
      const tagMatches = Array.isArray(node.tags) && node.tags.some((t) => t.toLowerCase().includes(lowerQuery));
      const selfMatches = nameMatches || descMatches || tagMatches;

      if (selfMatches && node.depth > 0) {
        matchedNodesCount++;
      }

      let hasMatchingDescendant = false;
      if (Array.isArray(node.children) && node.children.length > 0) {
        for (const child of node.children) {
          const childResult = evaluateNode(child, ancestorMatched || selfMatches);
          if (childResult.selfMatches || childResult.hasMatchingDescendant) {
            hasMatchingDescendant = true;
          }
        }
      }

      const info = {
        selfMatches,
        hasMatchingDescendant,
        ancestorMatched
      };
      matchMap.set(node.id, info);

      // Auto-expand branches that contain matching descendants (or matching categories)
      if (hasMatchingDescendant || (selfMatches && Array.isArray(node.children) && node.children.length > 0)) {
        state.expandedIds.add(node.id);
      }

      return info;
    }

    state.expandedIds.clear();
    state.roots.forEach((rootNode) => {
      evaluateNode(rootNode, false);
    });

    state.filteredMatchMap = matchMap;
    dom.searchStatus.hidden = false;
    dom.searchStatus.textContent = `Showing ${matchedNodesCount.toLocaleString()} matching ${matchedNodesCount === 1 ? 'result' : 'results'} for "${query}"`;

    renderTree();
  }

  function shouldRenderNodeInSearch(nodeId) {
    if (!state.filteredMatchMap) return true;
    const info = state.filteredMatchMap.get(nodeId);
    if (!info) return false;
    return info.selfMatches || info.hasMatchingDescendant || info.ancestorMatched;
  }

  function getVisibleChildren(node) {
    if (!Array.isArray(node.children)) return [];
    if (!state.searchQuery || !state.filteredMatchMap) {
      return node.children;
    }
    return node.children.filter((child) => shouldRenderNodeInSearch(child.id));
  }

  function highlightText(text, query) {
    const escapedText = escapeHTML(text);
    if (!query) return escapedText;

    const escapedQuery = escapeRegExp(escapeHTML(query));
    if (!escapedQuery) return escapedText;

    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escapedText.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  // ============================================================================
  // Event Binding & Keyboard Navigation
  // ============================================================================
  function bindEvents() {
    // Delegated click handler on the tree
    dom.treeRoot.addEventListener('click', (e) => {
      const btn = e.target.closest('[role="treeitem"]');
      if (!btn) return;
      const nodeId = btn.dataset.nodeId;
      if (!nodeId) return;

      const node = state.nodeById.get(nodeId);
      if (!node) return;

      if (Array.isArray(node.children) && node.children.length > 0) {
        toggleNodeExpansion(nodeId);
      }
      selectNode(nodeId, { openMobileSheet: true, scrollIntoView: false });
    });

    // Keyboard navigation on tree (WAI-ARIA Treeview Pattern)
    dom.treeRoot.addEventListener('keydown', handleTreeKeyDown);

    // Search Input
    dom.searchInput.addEventListener('input', (e) => {
      handleSearchInput(e.target.value);
    });

    dom.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dom.searchInput.value) {
        e.preventDefault();
        dom.searchInput.value = '';
        handleSearchInput('');
      }
    });

    dom.searchClear.addEventListener('click', () => {
      dom.searchInput.value = '';
      handleSearchInput('');
      dom.searchInput.focus();
    });

    dom.btnResetSearch.addEventListener('click', () => {
      dom.searchInput.value = '';
      handleSearchInput('');
      dom.searchInput.focus();
    });

    // Expand All / Collapse All
    dom.btnExpandAll.addEventListener('click', expandAll);
    dom.btnCollapseAll.addEventListener('click', collapseAll);

    // Mobile Bottom Sheet Close
    dom.detailCloseBtn.addEventListener('click', closeMobileDetailSheet);
    dom.panelBackdrop.addEventListener('click', closeMobileDetailSheet);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dom.detailPanel.classList.contains('is-mobile-open')) {
        closeMobileDetailSheet();
      }
    });
  }

  function handleTreeKeyDown(e) {
    const currentBtn = e.target.closest('[role="treeitem"]');
    if (!currentBtn) return;

    const nodeId = currentBtn.dataset.nodeId;
    const node = state.nodeById.get(nodeId);
    if (!node) return;

    const visibleItems = Array.from(dom.treeRoot.querySelectorAll('[role="treeitem"]'));
    const currentIndex = visibleItems.indexOf(currentBtn);

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        if (currentIndex >= 0 && currentIndex < visibleItems.length - 1) {
          visibleItems[currentIndex + 1].focus();
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (currentIndex > 0) {
          visibleItems[currentIndex - 1].focus();
        }
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        const hasChildren = Array.isArray(node.children) && node.children.length > 0;
        if (hasChildren) {
          if (!state.expandedIds.has(nodeId)) {
            toggleNodeExpansion(nodeId, true);
          } else {
            // Focus first child
            const updatedItems = Array.from(dom.treeRoot.querySelectorAll('[role="treeitem"]'));
            const idx = updatedItems.indexOf(currentBtn);
            if (idx >= 0 && idx < updatedItems.length - 1) {
              updatedItems[idx + 1].focus();
            }
          }
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        const hasChildren = Array.isArray(node.children) && node.children.length > 0;
        if (hasChildren && state.expandedIds.has(nodeId)) {
          toggleNodeExpansion(nodeId, false);
        } else if (node.parentId) {
          const parentBtn = document.getElementById(`treeitem-${node.parentId}`);
          if (parentBtn) parentBtn.focus();
        }
        break;
      }
      case 'Home': {
        e.preventDefault();
        if (visibleItems.length > 0) {
          visibleItems[0].focus();
        }
        break;
      }
      case 'End': {
        e.preventDefault();
        if (visibleItems.length > 0) {
          visibleItems[visibleItems.length - 1].focus();
        }
        break;
      }
      default:
        break;
    }
  }

  // ============================================================================
  // Helpers & SVG Icons
  // ============================================================================
  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function getChevronSVG() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
  }

  function getHealthIconSVG() {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66"/><path d="m18 15-2-2"/><path d="m15 18-2-2"/></svg>`;
  }

  function getWealthIconSVG() {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`;
  }

  // Start the app
  init();
})();
