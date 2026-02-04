/**
 * Tests for SaveSearchForm component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../utils/test-utils';
import userEvent from '@testing-library/user-event';
import { SaveSearchForm } from '@/components/Search/SaveSearchForm';
import type { SearchCriteria } from '@/types';

// Mock the API client
vi.mock('@/api/client', () => ({
  searchApi: {
    createSavedSearch: vi.fn().mockResolvedValue({ id: '123', name: 'Test Search' }),
  },
}));

describe('SaveSearchForm', () => {
  const mockCriteria: SearchCriteria = {
    min_sf: 5000,
    max_sf: 20000,
    cities: ['Anaheim', 'Fullerton'],
    for_lease: true,
  };

  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the form', () => {
      render(
        <SaveSearchForm
          criteria={mockCriteria}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      // Form should be in document
      const form = document.querySelector('form');
      expect(form).toBeInTheDocument();
    });

    it('renders input fields', () => {
      render(
        <SaveSearchForm
          criteria={mockCriteria}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      // Should have at least one text input
      const inputs = screen.getAllByRole('textbox');
      expect(inputs.length).toBeGreaterThan(0);
    });

    it('renders submit button', () => {
      render(
        <SaveSearchForm
          criteria={mockCriteria}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('User Actions', () => {
    it('allows typing in input fields', async () => {
      const user = userEvent.setup();
      render(
        <SaveSearchForm
          criteria={mockCriteria}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const inputs = screen.getAllByRole('textbox');
      const firstInput = inputs[0];

      await user.type(firstInput, 'My Search');
      expect(firstInput).toHaveValue('My Search');
    });

    it('calls onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <SaveSearchForm
          criteria={mockCriteria}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      // Find a button that looks like cancel (usually second button or has cancel text)
      const buttons = screen.getAllByRole('button');
      // Click the last button which is typically cancel
      const cancelButton = buttons.find(btn =>
        btn.textContent?.toLowerCase().includes('cancel')
      ) || buttons[buttons.length - 1];

      await user.click(cancelButton);
      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe('Form Submission', () => {
    it('submits form with valid data', async () => {
      const user = userEvent.setup();
      render(
        <SaveSearchForm
          criteria={mockCriteria}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      // Fill in the first input (name field)
      const inputs = screen.getAllByRole('textbox');
      await user.type(inputs[0], 'Test Saved Search');

      // Find and click submit button
      const buttons = screen.getAllByRole('button');
      const submitButton = buttons.find(btn =>
        btn.textContent?.toLowerCase().includes('save') ||
        btn.getAttribute('type') === 'submit'
      ) || buttons[0];

      await user.click(submitButton);

      // Wait for mutation to complete
      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
      }, { timeout: 3000 });
    });
  });
});

describe('SaveSearchForm with different criteria', () => {
  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();

  it('handles empty criteria', () => {
    const emptyCriteria: SearchCriteria = {};

    render(
      <SaveSearchForm
        criteria={emptyCriteria}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    );

    const form = document.querySelector('form');
    expect(form).toBeInTheDocument();
  });

  it('handles criteria with all fields', () => {
    const fullCriteria: SearchCriteria = {
      min_sf: 10000,
      max_sf: 50000,
      cities: ['Anaheim', 'Brea', 'Fullerton'],
      for_sale: true,
      for_lease: true,
      vacant_only: true,
      power_volts: '480V_3P',
    };

    render(
      <SaveSearchForm
        criteria={fullCriteria}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    );

    const form = document.querySelector('form');
    expect(form).toBeInTheDocument();
  });
});
