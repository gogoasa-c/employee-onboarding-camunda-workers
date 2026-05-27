import 'dotenv/config'
import { Camunda8 } from '@camunda8/sdk'

const c8 = new Camunda8()
const zeebe = c8.getZeebeGrpcApiClient()

zeebe.createWorker({
  taskType: 'rollback',
  taskHandler: async (job) => {
    const {
      appAccessList,
      benefitPackage,
      equipmentList
    } = job.variables

    try {

      console.log(
        `[COMPENSATION] Rolling back onboarding for employee with appAccessList: ${appAccessList}, benefitPackage: ${benefitPackage}, equipmentList: ${equipmentList}`
      )

      const rollbackState = {
        appAccessList: null,
        benefitPackage: null,
        equipmentList: null
      }

      return job.complete(rollbackState)
    } catch (err) {
      return job.fail({
        errorMessage: `Compensation failed: ${err.message}`,
        retryBackOff: 5000,
      })
    }
  },
})

console.log('Worker started for: rollback')