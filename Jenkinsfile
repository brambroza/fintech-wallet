// Build → test → push images → deploy to the GO Along VM over SSH.
// Jenkins credentials expected:
//   registry-creds  (username/password for REGISTRY)
//   deploy-ssh      (SSH key for DEPLOY_HOST, user with docker rights)
pipeline {
  agent any

  parameters {
    string(name: 'REGISTRY', defaultValue: 'registry.goalong.co.th', description: 'Docker registry')
    string(name: 'DEPLOY_HOST', defaultValue: 'deploy@canteen-vm', description: 'SSH target running deploy/docker-compose.prod.yml')
    string(name: 'API_URL', defaultValue: 'https://api.canteen.example.co.th', description: 'Public API URL baked into the web build')
    string(name: 'LIFF_ID', defaultValue: '', description: 'LINE LIFF id for /liff')
    booleanParam(name: 'DEPLOY', defaultValue: false, description: 'Deploy after a green build')
  }

  environment {
    TAG = "${env.GIT_COMMIT?.take(8) ?: 'manual'}"
  }

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  stages {
    stage('Test API') {
      steps {
        sh '''
          docker rm -f canteen-ci-db >/dev/null 2>&1 || true
          docker run -d --name canteen-ci-db -e POSTGRES_PASSWORD=ci -p 55432:5432 postgres:17-alpine
          for i in $(seq 1 30); do docker exec canteen-ci-db pg_isready -U postgres && break; sleep 1; done
          docker exec canteen-ci-db psql -U postgres -c "create database wallet_test"
          docker run --rm --network host -v "$PWD":/src -w /src node:22-alpine sh -c "
            npm ci &&
            npm run typecheck -w apps/api &&
            TEST_DATABASE_URL=postgres://postgres:ci@localhost:55432/wallet_test \
            TEST_DATABASE_URL_CANTEEN=postgres://postgres:ci@localhost:55432/wallet_test_canteen \
            npm test -w apps/api"
        '''
      }
      post { always { sh 'docker rm -f canteen-ci-db >/dev/null 2>&1 || true' } }
    }

    stage('Build images') {
      steps {
        sh "docker build -f apps/api/Dockerfile -t ${params.REGISTRY}/canteen-api:${TAG} -t ${params.REGISTRY}/canteen-api:latest ."
        sh "docker build -t ${params.REGISTRY}/canteen-web:${TAG} -t ${params.REGISTRY}/canteen-web:latest --build-arg VITE_SERVER_URL=${params.API_URL} --build-arg VITE_LIFF_ID=${params.LIFF_ID} apps/web"
      }
    }

    stage('Push') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'registry-creds', usernameVariable: 'U', passwordVariable: 'P')]) {
          sh 'echo "$P" | docker login ' + params.REGISTRY + ' -u "$U" --password-stdin'
          sh "docker push ${params.REGISTRY}/canteen-api:${TAG} && docker push ${params.REGISTRY}/canteen-api:latest"
          sh "docker push ${params.REGISTRY}/canteen-web:${TAG} && docker push ${params.REGISTRY}/canteen-web:latest"
        }
      }
    }

    stage('Deploy') {
      when { expression { params.DEPLOY } }
      steps {
        sshagent(credentials: ['deploy-ssh']) {
          // Migrations run on API start (advisory-locked). Pin TAG so a rollback is "TAG=<old> up -d".
          sh """
            ssh -o StrictHostKeyChecking=accept-new ${params.DEPLOY_HOST} '
              cd ~/canteen &&
              TAG=${TAG} docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod pull api web &&
              TAG=${TAG} docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d &&
              sleep 5 && docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod ps'
          """
        }
      }
    }
  }
}
