const chartSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="300" viewBox="0 0 640 300">
<rect width="640" height="300" fill="#f8fafc"/>
<g fill="#2563eb">
<rect x="70" y="150" width="70" height="120" rx="4"/><rect x="190" y="110" width="70" height="160" rx="4"/>
<rect x="310" y="80" width="70" height="190" rx="4"/><rect x="430" y="40" width="70" height="230" rx="4"/>
</g>
<g font-family="Arial" font-size="16" fill="#475569" text-anchor="middle">
<text x="105" y="292">Q1</text><text x="225" y="292">Q2</text><text x="345" y="292">Q3</text><text x="465" y="292">Q4</text>
</g>
<text x="32" y="36" font-family="Arial" font-size="20" font-weight="bold" fill="#0f172a">Revenue by quarter</text>
</svg>`

export const CHART_URL = `data:image/svg+xml;base64,${btoa(chartSvg)}`

export const SAMPLE_HTML = `
<h1 style="text-align: center">Quarterly Business Review</h1>
<p style="text-align: center"><span style="color: #6b7280">Prepared for the leadership team · Q3 2026</span></p>
<h2>Summary</h2>
<p>Revenue grew <strong>18%</strong> quarter over quarter, driven by <em>enterprise renewals</em> and the launch of the
<a href="https://example.com">self-serve plan</a>. Churn fell to <mark data-color="#bbf7d0" style="background-color: #bbf7d0">2.1%</mark>,
the lowest on record.</p>
<figure data-type="image" data-align="center" style="width: 480px"><img src="${CHART_URL}" alt="Revenue by quarter bar chart"><figcaption>Figure 1 – Revenue by quarter</figcaption></figure>
<h2>Key results</h2>
<table><tbody>
<tr><th colwidth="220"><p>Metric</p></th><th><p>Q2</p></th><th><p>Q3</p></th><th><p>Change</p></th></tr>
<tr><td><p>Revenue</p></td><td><p>$4.2M</p></td><td><p>$4.9M</p></td><td data-background="#bbf7d0" style="background-color: #bbf7d0"><p><strong>+18%</strong></p></td></tr>
<tr><td><p>Active customers</p></td><td><p>1,240</p></td><td><p>1,415</p></td><td data-background="#bbf7d0" style="background-color: #bbf7d0"><p><strong>+14%</strong></p></td></tr>
<tr><td><p>Support tickets</p></td><td><p>3,100</p></td><td><p>3,420</p></td><td data-background="#fecaca" style="background-color: #fecaca"><p>+10%</p></td></tr>
</tbody></table>
<h2>Next steps</h2>
<ol>
<li><p>Expand the partner programme to <span style="color: #2563eb">EMEA</span></p>
<ul><li><p>Hire two regional managers</p></li><li><p>Localise onboarding</p></li></ul></li>
<li><p>Ship usage-based billing</p></li>
</ol>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="true"><p>Board deck approved</p></li>
<li data-type="taskItem" data-checked="false"><p>Publish customer case studies</p></li>
</ul>
<blockquote><p>“The best quarter in the company’s history.” — CFO</p></blockquote>
<pre><code class="language-typescript">const growth = (current: number, previous: number) =>
  Math.round(((current - previous) / previous) * 100)</code></pre>
`
