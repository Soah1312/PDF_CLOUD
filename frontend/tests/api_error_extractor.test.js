import test from 'node:test';
import assert from 'node:assert/strict';
import { extractErrorMessage } from '../src/services/api.js';

test('1. extractErrorMessage: handles FastAPI 422 validation error array', () => {
  const pydanticError = {
    response: {
      status: 422,
      data: {
        detail: [
          {
            type: 'missing',
            loc: ['body', 'text'],
            msg: 'Field required',
            input: null,
          },
        ],
      },
    },
  };

  const message = extractErrorMessage(pydanticError);
  assert.equal(typeof message, 'string');
  assert.equal(message.includes('Field required'), true);
  assert.equal(message.includes('text'), true);
});

test('2. extractErrorMessage: handles standard string detail', () => {
  const err = {
    response: {
      status: 400,
      data: {
        detail: 'Watermark text cannot be empty.',
      },
    },
  };

  const message = extractErrorMessage(err);
  assert.equal(message, 'Watermark text cannot be empty.');
});

test('3. extractErrorMessage: handles network error without response', () => {
  const err = new Error('Network Error');
  const message = extractErrorMessage(err);
  assert.equal(message, 'Network Error');
});

test('4. extractErrorMessage: handles null/undefined with custom fallback', () => {
  const message = extractErrorMessage(null, 'Custom fallback error');
  assert.equal(message, 'Custom fallback error');
});

test('5. extractErrorMessage: handles object detail with message or msg', () => {
  const err = {
    response: {
      status: 500,
      data: {
        detail: {
          msg: 'Internal processing failure',
        },
      },
    },
  };

  const message = extractErrorMessage(err);
  assert.equal(message, 'Internal processing failure');
});
