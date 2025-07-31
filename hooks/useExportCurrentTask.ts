import type { Task } from "@/types/api";
import { useTauriSamples } from "@/hooks/useTauriSamples";
import { useTauriWakewords } from "@/hooks/useTauriWakewords";
import generateASRTestReport, {
  ASRTestReport,
} from "@/utils/generateASRTestReport";

export function useExportCurrentTask(currentTask: Task | null) {
    const { samples } = useTauriSamples();
    const { wakewords: wakeWords } = useTauriWakewords();
  const exportCurrentTask = () => {
    
    if (currentTask) {
      // 使用类型断言避免类型错误
      const TaskReport = {
        taskName: currentTask.name,
        date: currentTask.created_at,
        audioType: currentTask.audioType || "",
        audioFile: currentTask.wake_word_ids.length > 0 ? (wakeWords.find(w => w.id === currentTask.wake_word_ids[0])?.text || "") : "",
        audioDuration: currentTask.audioDuration || "",
        audioCategory: currentTask.audioCategory || "",
        testCollection: currentTask.testCollection || "",
        testDuration: currentTask.testDuration || "",
        sentenceAccuracy: currentTask.sentenceAccuracy || null,
        wordAccuracy: currentTask.wordAccuracy || null,
        characterErrorRate: currentTask.characterErrorRate || null,
        recognitionSuccessRate: currentTask.recognitionSuccessRate || null,
        totalWords: currentTask.totalWords || null,
        insertionErrors: currentTask.insertionErrors || null,
        deletionErrors: currentTask.deletionErrors || null,
        substitutionErrors: currentTask.substitutionErrors || null,
        fastestRecognitionTime: currentTask.fastestRecognitionTime || null,
        slowestRecognitionTime: currentTask.slowestRecognitionTime || null,
        averageRecognitionTime: currentTask.averageRecognitionTime || null,
        completedSamples: currentTask.test_result ? Object.keys(currentTask.test_result).length : 0,
        items: currentTask.test_result && samples
          ? Object.entries(currentTask.test_result).map(([id, item]) => {
              return {
                audioFile: wakeWords.find(w => w.id === currentTask.wake_word_ids[0])?.text || "",
                recognitionFile: item.recognitionFile || "",
                device: item.device || "科大讯飞ASRAPI",
                recognitionResult: item.recognitionResult || "成功",
                insertionErrors:
                  item.insertionErrors !== undefined
                    ? item.insertionErrors
                    : null,
                deletionErrors:
                  item.deletionErrors !==
                  undefined
                    ? item.deletionErrors
                    : null,
                substitutionErrors:
                  item.substitutionErrors !== undefined
                    ? item.substitutionErrors
                    : null,
                totalWords: item.totalWords || null,
                referenceText: samples.find(s => s.id === Number(id))?.text || "",
                recognizedText: item.recognizedText || "",
                resultStatus: item.resultStatus || "",
                recognitionTime: item.recognitionTime || null,
                machineResponse: currentTask.machine_response
                  ? currentTask.machine_response[Number(id)]?.text
                  : "",
                responseTime: item.responseTime || null,
                LLMAnalysisResult: item.assessment ? String(item.assessment.valid) : "",
                totalScore: item.assessment?.overall_score || null,
                semantic_correctness:
                  item.assessment?.semantic_correctness?.score || null,
                state_change_confirmation:
                  item.assessment?.state_change_confirmation?.score || null,
                unambiguous_expression:
                  item.assessment?.unambiguous_expression?.score || null,
                testTime: item.test_time || "",
              };
            })
          : [],
      };
      // 使用类型断言将TaskReport转换为ASRTestReport类型
      generateASRTestReport(TaskReport as ASRTestReport, `${currentTask.name}.xlsx`);
    }
  };
  return { exportCurrentTask };
}
