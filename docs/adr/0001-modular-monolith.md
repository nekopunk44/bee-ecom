# Modular monolith

Status: accepted for foundation, 2026-09-22.

## Context

The platform needs transactional commerce and a small operational footprint.

## Decision

Keep bounded modules in one C++ API, with a separately deployed worker sharing domain code.

## Alternatives

Microservices increase network failure modes and distributed transaction costs; an unstructured monolith hides dependencies.

## Consequences

Modules own use cases and repositories; extraction requires measured need. Health is the first implemented module.
