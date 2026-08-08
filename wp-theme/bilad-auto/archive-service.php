<?php
/**
 * أرشيف الخدمات
 *
 * @package BiladAuto
 */

get_header();
?>

<header class="page-header">
	<div class="container">
		<span class="section-eyebrow"><?php esc_html_e( 'ماذا نقدم', 'bilad-auto' ); ?></span>
		<h1 class="page-title"><?php esc_html_e( 'خدماتنا', 'bilad-auto' ); ?></h1>
		<p class="page-subtitle"><?php esc_html_e( 'حلول طاقة شمسية متكاملة — من التصميم حتى الدعم بعد البيع', 'bilad-auto' ); ?></p>
	</div>
</header>

<?php
if ( have_posts() ) :
	$i = 0;
	while ( have_posts() ) :
		the_post();
		$i++;
		$alt      = ( 0 === $i % 2 ) ? ' service-section--alt' : '';
		$reverse  = ( 0 === $i % 2 ) ? ' service-block--reverse' : '';
		$range    = get_post_meta( get_the_ID(), '_bilad_range', true );
		$features = get_post_meta( get_the_ID(), '_bilad_features', true );
		?>
		<section class="service-section section<?php echo esc_attr( $alt ); ?>">
			<div class="container">
				<div class="service-block<?php echo esc_attr( $reverse ); ?>">
					<div class="service-icon-wrap">
						<?php if ( has_post_thumbnail() ) : ?>
							<?php the_post_thumbnail( 'thumbnail' ); ?>
						<?php endif; ?>
					</div>
					<div class="service-content">
						<span class="service-number"><?php echo esc_html( str_pad( $i, 2, '0', STR_PAD_LEFT ) ); ?></span>
						<h2><?php the_title(); ?></h2>
						<div class="service-desc"><?php the_content(); ?></div>

						<?php if ( $features ) : ?>
							<ul class="service-features">
								<?php foreach ( array_filter( array_map( 'trim', explode( "\n", $features ) ) ) as $feature ) : ?>
									<li><?php echo esc_html( $feature ); ?></li>
								<?php endforeach; ?>
							</ul>
						<?php endif; ?>

						<?php if ( $range ) : ?>
							<div class="service-range">
								<div class="range-item">
									<span class="range-label"><?php esc_html_e( 'نطاق القدرة', 'bilad-auto' ); ?></span>
									<span class="range-value"><?php echo esc_html( $range ); ?></span>
								</div>
							</div>
						<?php endif; ?>

						<a href="<?php echo esc_url( home_url( '/contact/' ) ); ?>" class="btn btn-gold">
							<?php esc_html_e( 'اطلب استشارة مجانية', 'bilad-auto' ); ?>
						</a>
					</div>
				</div>
			</div>
		</section>
		<?php
	endwhile;
else :
	?>
	<section class="section">
		<div class="container">
			<div class="no-results">
				<p><?php esc_html_e( 'لم تُضف خدمات بعد. أضفها من: لوحة التحكم ← الخدمات', 'bilad-auto' ); ?></p>
			</div>
		</div>
	</section>
	<?php
endif;
?>

<section class="cta-section section">
	<div class="container">
		<div class="cta-box">
			<h2><?php esc_html_e( 'جاهز تبدأ؟', 'bilad-auto' ); ?></h2>
			<p><?php esc_html_e( 'تواصل معنا اليوم واحصل على عرض سعر مجاني خلال 24 ساعة', 'bilad-auto' ); ?></p>
			<div class="cta-btns">
				<a href="<?php echo esc_url( home_url( '/contact/' ) ); ?>" class="btn btn-gold">
					<?php esc_html_e( 'احصل على عرض سعر', 'bilad-auto' ); ?>
				</a>
				<a href="<?php echo esc_url( bilad_whatsapp_url() ); ?>" class="btn btn-outline" target="_blank" rel="noopener">
					<?php esc_html_e( 'واتساب مباشر', 'bilad-auto' ); ?>
				</a>
			</div>
		</div>
	</div>
</section>

<?php get_footer(); ?>
