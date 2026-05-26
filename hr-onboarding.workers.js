import 'dotenv/config'
import { Camunda8 } from '@camunda8/sdk'

const c8 = new Camunda8()
const zeebe = c8.getZeebeGrpcApiClient()

zeebe.createWorker({
  taskType: 'generate-username',
  taskHandler: async (job) => {
    const { firstName, lastName } = job.variables

    try {
      if (!firstName || !lastName) {
        throw new Error('Missing firstName or lastName')
      }

      // normalize (fără diacritice + lowercase)
      const normalize = (str) =>
        str
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')

      const fn = normalize(firstName)
      const ln = normalize(lastName)

      // variantă username: initial + lastname
      const username = `${fn[0]}${ln}`

      console.log('Generated username:', username)

      return job.complete({
        username,
      })
    } catch (err) {
      return job.fail({
        errorMessage: `Username generation failed: ${err.message}`,
        retryBackOff: 5000,
      })
    }
  },
})

console.log('Worker started for: generate-username')