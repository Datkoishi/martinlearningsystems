const SCHEMA_VERSION = '1.0.0';

const blockTypes = new Set([
  'paragraph',
  'math_block',
  'figure',
  'table',
  'list',
  'blockquote',
  'section_break'
]);

const inlineTypes = new Set(['text', 'math_inline', 'link']);
const safeLinkProtocols = new Set(['http:', 'https:', 'mailto:']);

export const richContentJsonSchema = {
  $id: 'https://martinlearningsystems.local/schemas/rich-content-1.0.0.json',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'EduAssess Rich Content',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'nodes'],
  properties: {
    schemaVersion: { const: SCHEMA_VERSION },
    nodes: {
      type: 'array',
      items: { $ref: '#/$defs/blockNode' }
    }
  },
  $defs: {
    blockNode: {
      type: 'object',
      required: ['type'],
      properties: {
        type: { enum: [...blockTypes] },
        children: { type: 'array' },
        latex: { type: 'string' },
        assetId: { type: 'string' },
        alt: { type: 'string' },
        caption: { type: 'string' },
        headers: { type: 'array' },
        rows: { type: 'array' },
        items: { type: 'array' }
      }
    },
    inlineNode: {
      type: 'object',
      required: ['type'],
      properties: {
        type: { enum: [...inlineTypes] },
        text: { type: 'string' },
        latex: { type: 'string' },
        href: { type: 'string' },
        children: { type: 'array' }
      }
    }
  }
};

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const addError = (errors, path, message) => errors.push({ path, message });

const validateInlineNode = (node, path, errors) => {
  if (!isObject(node) || !inlineTypes.has(node.type)) {
    addError(errors, path, 'Nút inline không hợp lệ.');
    return;
  }

  if (node.type === 'text') {
    if (typeof node.text !== 'string') addError(errors, `${path}.text`, 'Văn bản phải là chuỗi.');
    if (node.marks !== undefined) {
      const supportedMarks = new Set(['bold', 'italic', 'underline', 'subscript', 'superscript']);
      if (!Array.isArray(node.marks) || node.marks.some((mark) => !supportedMarks.has(mark))) {
        addError(errors, `${path}.marks`, 'Định dạng văn bản không được hỗ trợ.');
      }
    }
  }

  if (node.type === 'math_inline' && typeof node.latex !== 'string') {
    addError(errors, `${path}.latex`, 'Công thức inline phải có LaTeX.');
  }

  if (node.type === 'link') {
    if (typeof node.href !== 'string') {
      addError(errors, `${path}.href`, 'Liên kết phải có địa chỉ.');
    } else {
      try {
        const parsed = new URL(node.href);
        if (!safeLinkProtocols.has(parsed.protocol)) addError(errors, `${path}.href`, 'Giao thức liên kết không an toàn.');
      } catch {
        addError(errors, `${path}.href`, 'Địa chỉ liên kết không hợp lệ.');
      }
    }
    if (!Array.isArray(node.children) || node.children.length === 0) {
      addError(errors, `${path}.children`, 'Liên kết phải có nội dung.');
    } else {
      node.children.forEach((child, index) => validateInlineNode(child, `${path}.children[${index}]`, errors));
    }
  }
};

const validateCell = (cell, path, errors) => {
  if (!isObject(cell) || !Array.isArray(cell.content)) {
    addError(errors, path, 'Ô bảng phải có nội dung rich content.');
    return;
  }
  if (cell.rowspan !== undefined && (!Number.isInteger(cell.rowspan) || cell.rowspan < 1)) {
    addError(errors, `${path}.rowspan`, 'rowspan phải là số nguyên dương.');
  }
  if (cell.colspan !== undefined && (!Number.isInteger(cell.colspan) || cell.colspan < 1)) {
    addError(errors, `${path}.colspan`, 'colspan phải là số nguyên dương.');
  }
  cell.content.forEach((node, index) => validateBlockNode(node, `${path}.content[${index}]`, errors));
};

const validateBlockNode = (node, path, errors) => {
  if (!isObject(node) || !blockTypes.has(node.type)) {
    addError(errors, path, 'Nút block không hợp lệ.');
    return;
  }

  if (node.type === 'paragraph' || node.type === 'blockquote') {
    if (!Array.isArray(node.children)) {
      addError(errors, `${path}.children`, 'Đoạn văn phải có danh sách nội dung.');
    } else {
      node.children.forEach((child, index) => validateInlineNode(child, `${path}.children[${index}]`, errors));
    }
  }

  if (node.type === 'math_block' && typeof node.latex !== 'string') {
    addError(errors, `${path}.latex`, 'Khối công thức phải có LaTeX.');
  }

  if (node.type === 'figure') {
    if (typeof node.assetId !== 'string' || node.assetId.length === 0) {
      addError(errors, `${path}.assetId`, 'Hình phải tham chiếu assetId.');
    }
    if (typeof node.alt !== 'string' || node.alt.trim().length === 0) {
      addError(errors, `${path}.alt`, 'Hình phải có mô tả thay thế.');
    }
  }

  if (node.type === 'table') {
    if (!Array.isArray(node.rows) || node.rows.length === 0) {
      addError(errors, `${path}.rows`, 'Bảng phải có ít nhất một hàng.');
    } else {
      node.rows.forEach((row, rowIndex) => {
        if (!Array.isArray(row) || row.length === 0) {
          addError(errors, `${path}.rows[${rowIndex}]`, 'Hàng phải có ít nhất một ô.');
          return;
        }
        row.forEach((cell, cellIndex) => validateCell(cell, `${path}.rows[${rowIndex}][${cellIndex}]`, errors));
      });
    }
  }

  if (node.type === 'list') {
    if (!['ordered', 'unordered'].includes(node.style) || !Array.isArray(node.items)) {
      addError(errors, path, 'Danh sách phải có style và items hợp lệ.');
    } else {
      node.items.forEach((item, index) => {
        if (!Array.isArray(item)) addError(errors, `${path}.items[${index}]`, 'Mục danh sách phải là rich content.');
        else item.forEach((child, childIndex) => validateBlockNode(child, `${path}.items[${index}][${childIndex}]`, errors));
      });
    }
  }
};

export const validateRichContent = (content) => {
  const errors = [];
  if (!isObject(content)) return { valid: false, errors: [{ path: '$', message: 'Rich content phải là object.' }] };
  if (content.schemaVersion !== SCHEMA_VERSION) {
    addError(errors, '$.schemaVersion', `Chỉ hỗ trợ schemaVersion ${SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(content.nodes)) {
    addError(errors, '$.nodes', 'nodes phải là mảng.');
  } else {
    content.nodes.forEach((node, index) => validateBlockNode(node, `$.nodes[${index}]`, errors));
  }
  return { valid: errors.length === 0, errors };
};

export const assertValidRichContent = (content, label = 'richContent') => {
  const result = validateRichContent(content);
  if (!result.valid) {
    const error = new Error(`${label} không hợp lệ: ${result.errors.map((item) => `${item.path} ${item.message}`).join('; ')}`);
    error.code = 'INVALID_RICH_CONTENT';
    error.details = result.errors;
    throw error;
  }
  return content;
};
