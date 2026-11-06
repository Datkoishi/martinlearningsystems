const paragraph = (...children) => ({ type: 'paragraph', children });
const text = (value, marks) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });
const rich = (...nodes) => ({ schemaVersion: '1.0.0', nodes });

export const demoAssets = {
  'asset-demo-garden': {
    id: 'asset-demo-garden',
    url: '/assets/demo-garden.svg',
    mimeType: 'image/svg+xml',
    altText: 'Sơ đồ khu vườn hình chữ nhật ABCD, chiều dài 12 mét và chiều rộng 8 mét'
  }
};

export const demoFixedExam = {
  id: 'exam-demo-math-5',
  versionId: 'exam-demo-math-5-v1',
  version: 1,
  mode: 'FIXED',
  purpose: 'PRACTICE',
  approvalStatus: 'DRAFT',
  title: '[DEMO] Khám phá Toán lớp 5',
  description: 'Dữ liệu minh họa kỹ thuật, không phải đề thi chính thức.',
  grade: 5,
  subject: 'Toán',
  durationMinutes: 25,
  assets: demoAssets,
  stimuli: [
    {
      id: 'stimulus-garden-v1',
      title: 'Khu vườn của trường',
      content: rich(
        paragraph(text('Trường em có một khu vườn hình chữ nhật như sơ đồ. Các câu 1 và 2 cùng sử dụng dữ kiện này.')),
        {
          type: 'figure',
          assetId: 'asset-demo-garden',
          alt: demoAssets['asset-demo-garden'].altText,
          caption: 'Hình 1 — Sơ đồ khu vườn (dữ liệu DEMO)'
        },
        {
          type: 'table',
          rows: [
            [
              { header: true, content: [paragraph(text('Đại lượng', ['bold']))] },
              { header: true, content: [paragraph(text('Giá trị', ['bold']))] }
            ],
            [
              { content: [paragraph(text('Chiều dài'))] },
              { content: [paragraph(text('12 m'))] }
            ],
            [
              { content: [paragraph(text('Chiều rộng'))] },
              { content: [paragraph(text('8 m'))] }
            ]
          ]
        }
      )
    }
  ],
  sections: [
    {
      id: 'section-geometry',
      title: 'Phần I — Hình học',
      instruction: rich(paragraph(text('Quan sát hình, đọc dữ kiện và chọn đáp án đúng.'))),
      groups: [
        {
          id: 'group-garden',
          stimulusVersionId: 'stimulus-garden-v1',
          selectionPolicy: 'ATOMIC_ALL',
          questions: [
            {
              id: 'question-perimeter',
              versionId: 'question-perimeter-v1',
              order: 1,
              type: 'SINGLE_CHOICE',
              points: 1,
              content: rich(
                paragraph(
                  text('Chu vi khu vườn được tính theo công thức '),
                  { type: 'math_inline', latex: 'P = 2 \\times (a + b)' },
                  text('. Chu vi khu vườn là bao nhiêu?')
                )
              ),
              options: [
                { id: 'perimeter-a', content: rich(paragraph(text('20 m'))) },
                { id: 'perimeter-b', content: rich(paragraph(text('40 m'))) },
                { id: 'perimeter-c', content: rich(paragraph(text('80 m'))) }
              ],
              answerKey: { correctOptionIds: ['perimeter-b'] },
              explanation: rich(paragraph(text('Ta có '), { type: 'math_inline', latex: '2 \\times (12 + 8) = 40' }, text(' m.')))
            },
            {
              id: 'question-area',
              versionId: 'question-area-v1',
              order: 2,
              type: 'SHORT_NUMBER',
              points: 1,
              content: rich(paragraph(text('Tính diện tích khu vườn, đơn vị mét vuông.'))),
              options: [],
              answerKey: { numericValue: 96, tolerance: 0 },
              explanation: rich(paragraph(text('Diện tích là '), { type: 'math_inline', latex: '12 \\times 8 = 96' }, text(' m².')))
            }
          ]
        }
      ]
    },
    {
      id: 'section-data',
      title: 'Phần II — Dữ liệu',
      instruction: rich(paragraph(text('Đọc bảng và trả lời câu hỏi.'))),
      groups: [
        {
          id: 'group-books',
          selectionPolicy: 'SPLIT_WITH_STIMULUS',
          questions: [
            {
              id: 'question-books',
              versionId: 'question-books-v1',
              order: 3,
              type: 'MULTIPLE_CHOICE',
              points: 1,
              content: rich(
                {
                  type: 'table',
                  rows: [
                    [
                      { header: true, content: [paragraph(text('Ngày', ['bold']))] },
                      { header: true, content: [paragraph(text('Số sách', ['bold']))] }
                    ],
                    [
                      { content: [paragraph(text('Thứ Hai'))] },
                      { content: [paragraph(text('24'))] }
                    ],
                    [
                      { content: [paragraph(text('Thứ Ba'))] },
                      { content: [paragraph(text('31'))] }
                    ],
                    [
                      { content: [paragraph(text('Thứ Tư'))] },
                      { content: [paragraph(text('31'))] }
                    ]
                  ]
                },
                paragraph(text('Chọn tất cả các ngày thư viện cho mượn nhiều hơn 30 cuốn sách.'))
              ),
              options: [
                { id: 'books-mon', content: rich(paragraph(text('Thứ Hai'))) },
                { id: 'books-tue', content: rich(paragraph(text('Thứ Ba'))) },
                { id: 'books-wed', content: rich(paragraph(text('Thứ Tư'))) }
              ],
              answerKey: { correctOptionIds: ['books-tue', 'books-wed'] },
              explanation: rich(paragraph(text('31 lớn hơn 30, còn 24 không lớn hơn 30.')))
            }
          ]
        }
      ]
    }
  ]
};
