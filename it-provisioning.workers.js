import 'dotenv/config'
import { Camunda8 } from '@camunda8/sdk'

// Zero-conf constructor — reads all config from environment variables.
// For SaaS set these in your .env:
//   ZEEBE_GRPC_ADDRESS=grpcs://<cluster>.zeebe.camunda.io:443
//   ZEEBE_REST_ADDRESS=https://<region>.zeebe.camunda.io/<cluster-id>
//   ZEEBE_CLIENT_ID=...
//   ZEEBE_CLIENT_SECRET=...
//   CAMUNDA_OAUTH_URL=https://login.cloud.camunda.io/oauth/token
//   CAMUNDA_AUTH_STRATEGY=OAUTH
//
// For local C8Run (dev):
//   ZEEBE_REST_ADDRESS=http://localhost:8080
//   ZEEBE_GRPC_ADDRESS=grpc://localhost:26500
//   CAMUNDA_AUTH_STRATEGY=NONE

const c8 = new Camunda8()

// Job workers use the Zeebe gRPC client — still the correct path for workers
const zeebe = c8.getZeebeGrpcApiClient()

// ─── Worker 1: create-email-address ───────────────────────────────────────
zeebe.createWorker({
    taskType: 'create-email-address',
    taskHandler: async (job) => {
        const { firstName, lastName, adAccountId } = job.variables

        try {
            const emailAddress =
                `${firstName.toLowerCase()}.${lastName.toLowerCase()}@company.com`

            // TODO: call your mail provisioning API (Exchange, Google Workspace, etc.)
            console.log(
                `[create-email-address] Provisioned ${emailAddress} for AD account ${adAccountId}`
            )

            return job.complete({ emailAddress })

        } catch (err) {
            // Transient failure — Zeebe will retry based on remaining job.retries
            return job.fail({
                errorMessage: `Email provisioning failed: ${err.message}`,
                retryBackOff: 5000, // wait 5s before retrying
            })
        }
    },
})

// ─── Worker 2: fulfill-hardware ───────────────────────────────────────────
zeebe.createWorker({
    taskType: 'fulfill-hardware',
    taskHandler: async (job) => {
        const { firstName, lastName, hardwareTier, location } = job.variables

        try {
            const result = await dispatchHardwareOrder({
                firstName,
                lastName,
                hardwareTier,
                location,
            })

            if (result.status === 'OUT_OF_STOCK') {
                // Throws a BPMN error — caught by the boundary event on this task
                return job.error({
                    errorCode: 'HARDWARE_OUT_OF_STOCK',
                    errorMessage: `Hardware tier ${hardwareTier} is out of stock at ${location}`,
                })
            }

            console.log(
                `[fulfill-hardware] Order ${result.orderId} dispatched for ${firstName} ${lastName}`
            )
            return job.complete({ hardwareOrderId: result.orderId })

        } catch (err) {
            return job.fail({
                errorMessage: `Hardware fulfillment error: ${err.message}`,
                retryBackOff: 10000,
            })
        }
    },
})

// ─── Worker 3: notify-hr-hardware-delay ───────────────────────────────────
zeebe.createWorker({
    taskType: 'notify-hr-hardware-delay',
    taskHandler: async (job) => {
        const { firstName, lastName, managerEmail, hardwareTier } = job.variables

        // TODO: integrate with your email/Slack notification system
        console.log(
            `[notify-hr-delay] Notifying ${managerEmail} — ` +
            `hardware tier ${hardwareTier} out of stock for ${firstName} ${lastName}`
        )

        return job.complete()
    },
})

// ─── Stub: hardware procurement API ───────────────────────────────────────
async function dispatchHardwareOrder({ firstName, lastName, hardwareTier, location }) {
    // TODO: call your real procurement API
    return { status: 'DISPATCHED', orderId: `HW-${Date.now()}` }
}