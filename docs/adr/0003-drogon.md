# C++23 and Drogon

Status: accepted for foundation, 2026-09-22.

## Context

The required backend is C++23/Drogon with PostgreSQL and Redis.

## Decision

Pin Drogon 1.9.11 and build on Debian trixie with GCC 14, CMake and native database libraries.

## Alternatives

Switching languages violates the agreed stack; host-only setup complicates Windows onboarding.

## Consequences

Linux containers are the reference backend runtime. Async dependency checks keep HTTP event loops free. CTest runs inside the image build.
