# ADR-0001: Giữ modular monolith và rich content có version

- Status: Accepted
- Date: 2026-11-07

## Decision

Giữ React/Express/MySQL. Rich presentation dùng JSON schemaVersion có validator/renderer; metadata cần query dùng relational columns. Version exam/question/stimulus là thực thể riêng; student projection tách answer data.

## Consequences

Thay đổi nhỏ, phù hợp repo và dễ kiểm thử. Cần application service để enforce immutable publish và migration reader khi đổi schema. JSON không được bypass validation; database không tự hiểu toàn bộ AST.
