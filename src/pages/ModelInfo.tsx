import PageCardContainer from "../components/common/PageCardContainer.tsx";
import { models } from "../../shared/models.ts";

function providerLabel(provider: string | undefined) {
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  if (provider === "deepseek") return "DeepSeek";
  return "Unknown";
}

export default function ModelInfo() {
  const orderedModels = [...models].sort((a, b) => Number(a.price > 0) - Number(b.price > 0));

  return (
    <div className="min-h-screen px-4 py-6 md:px-6">
      <PageCardContainer className="mx-auto">
        <div className="mx-auto w-full max-w-5xl p-6 md:p-10">
          <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900">Model Info</h1>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="mt-1">
              <strong>Availability:</strong> Some models are intentionally not enabled for pricing
              reasons.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4">
            {orderedModels.map((model) => {
              const currentlyUnavailable = model.price > 0;
              return (
                <div
                  key={model.value}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900">{model.label}</h2>
                      <p className="text-sm text-slate-600 mt-1">
                        Model ID: <code>{model.value}</code>
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {providerLabel(model.provider)}
                      </span>
                      {model.supportsReasoningEffort ? (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                          Reasoning
                        </span>
                      ) : null}
                      {model.disabled ? (
                        <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800">
                          Disabled
                        </span>
                      ) : null}
                      {currentlyUnavailable ? (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                          Unavailable
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-slate-800">
                      <strong>Best for:</strong> {model.bestFor}
                    </p>

                    <div className="text-sm text-slate-800">
                      <strong>Strengths:</strong>
                      <ul className="mt-1 list-disc pl-5 text-slate-700">
                        {model.strengths.map((strength) => (
                          <li key={strength}>{strength}</li>
                        ))}
                      </ul>
                    </div>

                    {model.availabilityNote ? (
                      <p className="text-sm text-slate-700">{model.availabilityNote}</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </PageCardContainer>
    </div>
  );
}
