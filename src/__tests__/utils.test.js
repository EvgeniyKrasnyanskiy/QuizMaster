import { 
  parseQuestions, 
  encodeEncryptedPayload, 
  decodeEncryptedPayload, 
  stripDatExtension,
  formatTime
} from '../utils';

describe('Utils Tests', () => {
  
  describe('Encryption', () => {
    it('should correctly encode and decode a string', () => {
      const originalText = 'Hello, this is a test quiz content!';
      const encoded = encodeEncryptedPayload(originalText);
      const decoded = decodeEncryptedPayload(encoded);
      expect(decoded).toBe(originalText);
    });

    it('should return original text if it is not hex-encoded', () => {
      const plainText = 'Not an encrypted hex string';
      expect(decodeEncryptedPayload(plainText)).toBe(plainText);
    });
  });

  describe('Parser (parseQuestions)', () => {
    it('should correctly parse Multiple Choice (M) questions', () => {
      const csv = 'M;What is 2+2?;3;4;5;2';
      const { questions } = parseQuestions(csv);
      expect(questions).toHaveLength(1);
      expect(questions[0]).toEqual({
        type: 'multi',
        q: 'What is 2+2?',
        opts: ['3', '4', '5'],
        a: ['1'] // '2' is the 2nd option, index is 1
      });
    });

    it('should correctly parse Text (T) questions', () => {
      const csv = 'T;Color of sky?;Hint: starts with B;Blue';
      const { questions } = parseQuestions(csv);
      expect(questions).toHaveLength(1);
      expect(questions[0]).toEqual({
        type: 'text',
        q: 'Color of sky?',
        hint: 'Hint: starts with B',
        a: 'Blue'
      });
    });

    it('should extract metadata correctly', () => {
      const csv = 'METADATA=title:Test Quiz;author:Admin\nM;Q;A;B;1';
      const { metadata, questions } = parseQuestions(csv);
      expect(metadata).toEqual({
        title: 'Test Quiz',
        author: 'Admin'
      });
      expect(questions).toHaveLength(1);
    });

    it('should handle multi-answer M questions', () => {
      const csv = 'M;Select even numbers;1;2;3;4;2,4';
      const { questions } = parseQuestions(csv);
      expect(questions[0].a).toEqual(['1', '3']); // index 1 and 3
    });
  });

  describe('Formatting Helpers', () => {
    it('should strip .dat extension', () => {
      expect(stripDatExtension('quiz.dat')).toBe('quiz');
      expect(stripDatExtension('no_ext')).toBe('no_ext');
    });

    it('should format seconds to MM:SS', () => {
      expect(formatTime(65)).toBe('01:05');
      expect(formatTime(10)).toBe('00:10');
    });
  });
});
