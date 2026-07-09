# Development Philosophy

## Purpose

This document defines how CreteXchange should be built.

It exists to keep implementation aligned with the platform vision, product definition, operational reality, and long-term maintainability.

## Core Principles

### Documentation before Implementation

Document the problem, the workflow, and the expected outcome before building significant capabilities.

This reduces ambiguity, prevents rework, and creates a shared source of truth.

### Product before Pages

Product intent should be defined before screen layout.

Pages should reflect product decisions instead of driving them.

### Workflows before Screens

Construction operations are workflow-driven.

The platform should model what people do first, then present the screen structure that supports that work.

### Architecture before Implementation

The platform should understand data flow, integration boundaries, and system impact before code is added.

### Operational Events create Business Intelligence

Meaningful work should produce meaningful data.

When operational events are captured well, they can improve driver, owner, and platform decisions.

### Design around Construction Operations

CreteXchange should reflect how the construction industry operates, not how generic software interfaces are organized.

### Small validated iterations

Deliver work in small, testable increments.

This keeps risk low and makes progress easier to validate.

### Backward compatibility whenever practical

Enhance existing behavior when possible rather than forcing unnecessary disruption.

### Preservation Principle

Stable working functionality should be preserved whenever practical.

Replace it only when the new approach clearly improves the platform and is sufficiently validated.

### Platform before Features

Features should strengthen the platform as a whole, not create isolated one-off behavior.

### Intelligence before Complexity

Prefer designs that create useful insight with the least necessary complexity.

## Maintenance Note

When these principles conflict, the safer and more traceable option should be preferred unless product guidance says otherwise.
