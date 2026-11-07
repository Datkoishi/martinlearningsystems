const applyMarks = (value, marks = []) => marks.reduce((content, mark) => {
  if (mark === 'bold') return <strong>{content}</strong>;
  if (mark === 'italic') return <em>{content}</em>;
  if (mark === 'underline') return <u>{content}</u>;
  if (mark === 'subscript') return <sub>{content}</sub>;
  if (mark === 'superscript') return <sup>{content}</sup>;
  return content;
}, value);

const InlineNode = ({ node }) => {
  if (node.type === 'text') return applyMarks(node.text, node.marks);
  if (node.type === 'math_inline') {
    return <span className="math-inline" aria-label={`Công thức ${node.latex}`}>{node.latex}</span>;
  }
  if (node.type === 'link') {
    return (
      <a href={node.href} target="_blank" rel="noreferrer">
        {node.children.map((child, index) => <InlineNode key={index} node={child} />)}
      </a>
    );
  }
  return null;
};

const TableCellContent = ({ content, assets }) => content.map((node, index) => (
  <BlockNode key={index} node={node} assets={assets} />
));

const BlockNode = ({ node, assets }) => {
  if (node.type === 'paragraph' || node.type === 'blockquote') {
    const Tag = node.type === 'blockquote' ? 'blockquote' : 'p';
    return <Tag>{node.children.map((child, index) => <InlineNode key={index} node={child} />)}</Tag>;
  }

  if (node.type === 'math_block') {
    return <div className="math-block" aria-label={`Công thức ${node.latex}`}>{node.latex}</div>;
  }

  if (node.type === 'figure') {
    const asset = assets?.[node.assetId];
    return (
      <figure>
        {asset ? <img src={asset.url} alt={node.alt || asset.altText} /> : <div className="missing-asset">Thiếu hình: {node.assetId}</div>}
        {node.caption && <figcaption>{node.caption}</figcaption>}
      </figure>
    );
  }

  if (node.type === 'table') {
    return (
      <div className="table-scroll" tabIndex="0" aria-label="Bảng dữ liệu có thể cuộn ngang">
        <table>
          <tbody>
            {node.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => {
                  const Tag = cell.header ? 'th' : 'td';
                  return (
                    <Tag key={cellIndex} rowSpan={cell.rowspan} colSpan={cell.colspan}>
                      <TableCellContent content={cell.content} assets={assets} />
                    </Tag>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (node.type === 'list') {
    const Tag = node.style === 'ordered' ? 'ol' : 'ul';
    return (
      <Tag>
        {node.items.map((item, index) => (
          <li key={index}><TableCellContent content={item} assets={assets} /></li>
        ))}
      </Tag>
    );
  }

  if (node.type === 'section_break') return <hr />;
  return null;
};

export default function RichContent({ content, assets }) {
  if (!content?.nodes) return null;
  return (
    <div className="rich-content">
      {content.nodes.map((node, index) => <BlockNode key={index} node={node} assets={assets} />)}
    </div>
  );
}
