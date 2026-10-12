Pod::Spec.new do |s|
  s.name           = 'VidnivoExport'
  s.version        = '0.1.0'
  s.summary        = 'VIDNIVO native iOS video compositor'
  s.description    = 'Local AVFoundation-based MP4 export module for VIDNIVO'
  s.license        = { :type => 'MIT' }
  s.author         = 'VIDNIVO'
  s.homepage       = 'https://github.com/DesignatedDrinks/vidnivo'
  s.platform       = :ios, '16.0'
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files   = '**/*.{h,m,mm,swift}'
  s.swift_version  = '5.9'
  s.frameworks     = 'Speech', 'AVFoundation'
end
