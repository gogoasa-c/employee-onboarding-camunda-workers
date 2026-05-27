import 'dotenv/config'
import { Camunda8 } from '@camunda8/sdk'

const c8 = new Camunda8()

const zeebe = c8.getZeebeGrpcApiClient()

zeebe.createWorker({
    taskType: 'create-email-address',
    taskHandler: async (job) => {
        const { firstName, lastName, adAccountId } = job.variables

        try {
            const emailAddress = `${firstName}-${lastName}@company.com`

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

            if (location === 'bratislava') {
                result.status = 'OUT_OF_STOCK' // simulate out-of-stock for testing
            }

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

async function dispatchHardwareOrder({ firstName, lastName, hardwareTier, location }) {
    // TODO: call your real procurement API
    return { status: 'DISPATCHED', orderId: `HW-${Date.now()}` }
}

zeebe.createWorker({
    taskType: 'check-hardware-stock',
    taskHandler: async (job) => {
        const { hardwareTier, location } = job.variables

        try {
            // TODO: call your real inventory API
            const result = await checkInventory({ hardwareTier, location })

            console.log(
                `[check-hardware-stock] ${hardwareTier} at ${location}: ${result.inStock ? 'IN STOCK' : 'OUT OF STOCK'}`
            )

            return job.complete({ hardwareInStock: result.inStock })

        } catch (err) {
            return job.fail({
                errorMessage: `Stock check failed: ${err.message}`,
                retryBackOff: 5000,
            })
        }
    },
})

zeebe.createWorker({
    taskType: 'fulfill-hardware-no-issue',
    taskHandler: async (job) => {
        console.log('[fulfill-hardware-no-issue] Simulating hardware fulfillment without stock check that will work 100%!');

        return job.complete({hardwareInStock: true});
    }
})

async function checkInventory({ hardwareTier, location }) {
    return { inStock: true }
}

zeebe.createWorker({
    taskType: 'it-accounts-ready-notification',
    taskHandler: async (job) => {
        const { correlationKey } = job.variables

        try {
            // Publish the message to wake up the parent catch event
            await zeebe.publishMessage({
                name: 'IT_READY_ACCOUNTS',
                correlationKey: 'IT_READY_ACCOUNTS',
                timeToLive: { seconds: 60 },
                variables: {
                    itProvisioningComplete: true
                }
            })

            console.log(`[it-accounts-ready] Message published with correlationKey: ${correlationKey}`)
            return job.complete()

        } catch (err) {
            return job.fail({
                errorMessage: `Failed to publish IT ready message: ${err.message}`,
                retryBackOff: 5000,
            })
        }
    },
})