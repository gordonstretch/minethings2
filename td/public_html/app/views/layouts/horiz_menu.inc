<?
// Prepare Cities Menu

$mapLinkHref = array(
		'controller' => 'miners',
		'action' => 'map',
		$redirect,
	); 
$citiesMenuLink = $html->link('Cities', $mapLinkHref, array('id' => 'citytab', 'OnClick' => "$('citiesmenu').toggle(); return false;"));
$marketMenuLink = $html->link('Market', '/mine_types/browse', array('id' => 'markettab', 'OnClick' => $showMarketMenu ? "$('marketmenu').toggle(); return false;" : ''));
	?>
	<nav id="navcontainer">

		<ul id="nav">
			<li> <? echo $html->image(preg_replace('#\\.#', '', strtolower($currentCityName)).'.gif', array(
				'alt' => $currentCityName,
				'width' => '91',
				'height' => '47',
				)); ?></li>
			<li class="home"><? echo $html->link('', '/'); ?></li>
			<li class="miners"><? echo $html->link('', '/miners/list_miners'); ?></li>
			<li class="mines"><? echo $marketMenuLink; include 'marketmenu.inc'; ?>
			</li>

			<li class="map"><? echo $citiesMenuLink; include 'citiesmenu.inc'; ?>
			</li>

			<li class="shop"><? echo $html->link('', '/credits/shop'); ?></li>
			<li class="recruit"><? echo $html->link('', '/facebook/index'); ?></li>
			<li class="forums"><? echo $html->link('', '/miners/forums/'); ?></li>
			<li class="help"><? echo $html->link('', '/miners/help'); ?>	</li>
		</ul>

	</nav>
	<!--End Top Navigation-->   
